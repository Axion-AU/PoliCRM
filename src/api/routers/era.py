"""
ERA (Electoral Roll Access) API router.
Provides endpoints for ERA file management, fuzzy search, member matching,
and recruitment targeting features.
"""
import os
import logging
from typing import List, Optional
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, BackgroundTasks, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, distinct, text
from pydantic import BaseModel

from ..database import get_db
from ..dependencies import get_current_active_user
from ..models import Member, User, CheckResult
from ..era_models import ERARecord, ERAUpload, ERAMatch
from ..services.era import (
    parse_era_file,
    bulk_insert_era_records,
    match_member_to_era,
    save_era_match,
    get_era_stats,
    search_era_records,
    process_era_file,
    sync_era_files,
    verify_and_repair_era_file,
    ERASearchResult, MATCH_THRESHOLD, normalize_name
)
from ..services.household_analytics import (
    get_household_stats,
    get_member_household,
    get_top_converting_households,
    get_high_converting_members
)

logger = logging.getLogger(__name__)
router = APIRouter()

# ERA file storage directory
ERA_UPLOAD_DIR = os.path.join(os.path.dirname(__file__), '..', '..', '..', 'era')


# ============================================================================
# Request/Response Schemas
# ============================================================================

class ERASearchRequest(BaseModel):
    surname: str
    given_names: Optional[str] = None
    locality: Optional[str] = None
    postcode: Optional[str] = None
    threshold: int = MATCH_THRESHOLD
    limit: int = 20


class ERASearchResponse(BaseModel):
    era_record_id: int
    surname: str
    given_names: str
    full_address: str
    locality_name: str
    post_code: str
    federal_division: str
    state_district: str
    local_government_area: str
    overall_score: int
    name_score: int
    address_score: int


class ERAMatchResponse(BaseModel):
    member_id: int
    member_name: str
    era_match: Optional[ERASearchResponse]
    match_status: str  # 'matched', 'no_match', 'pending'


class HouseholdMember(BaseModel):
    era_record_id: int
    given_names: str
    surname: str
    gender: str
    date_of_birth: Optional[str]
    is_existing_member: bool = False


class HouseholdResponse(BaseModel):
    address: str
    locality: str
    postcode: str
    federal_division: str
    members: List[HouseholdMember]
    total_at_address: int


class RecruitmentTargetResponse(BaseModel):
    era_record_id: int
    given_names: str
    surname: str
    full_address: str
    federal_division: str
    relationship_type: str  # 'same_address', 'same_surname', 'same_surname_locality'
    related_member_id: int
    related_member_name: str


# ============================================================================
# ERA File Management
# ============================================================================

@router.post("/upload")
async def upload_era_file(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Upload an ERA .txt file for parsing and storage.
    Parsing happens in the background due to large file sizes.
    """
    if not file.filename.endswith('.txt'):
        raise HTTPException(status_code=400, detail="Only .txt files are supported")
    
    # Save uploaded file
    os.makedirs(ERA_UPLOAD_DIR, exist_ok=True)
    file_path = os.path.join(ERA_UPLOAD_DIR, file.filename)
    
    with open(file_path, 'wb') as f:
        content = await file.read()
        f.write(content)
    
    # Create upload record
    upload = ERAUpload(
        filename=file.filename,
        state=file.filename.split('_')[-1].replace('.txt', '')[:3],  # Extract state from filename
        uploaded_by=current_user.id
    )
    db.add(upload)
    db.commit()
    db.refresh(upload)
    
    # Start background parsing
    background_tasks.add_task(process_era_file, file_path, upload.id)
    
    return {
        "message": "ERA file upload started",
        "upload_id": upload.id,
        "filename": file.filename
    }





@router.get("/files")
def list_era_files(
    current_user: User = Depends(get_current_active_user)
):
    """List ERA .txt files available on disk (for resume/re-parse)."""
    os.makedirs(ERA_UPLOAD_DIR, exist_ok=True)
    files = []
    for f in os.listdir(ERA_UPLOAD_DIR):
        if f.endswith('.txt'):
            path = os.path.join(ERA_UPLOAD_DIR, f)
            size = os.path.getsize(path)
            files.append({
                "filename": f,
                "size_mb": round(size / 1024 / 1024, 2),
                "path": path
            })
    return files


@router.post("/parse-from-disk")
def parse_from_disk(
    filename: str,
    background_tasks: BackgroundTasks,
    clear_existing: bool = False,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Parse an ERA file already on disk (in /era folder).
    Use this to resume after server restart or re-parse without re-uploading.
    
    Args:
        filename: Name of the file in the /era folder
        clear_existing: If True, deletes existing ERA records before parsing
    """
    file_path = os.path.join(ERA_UPLOAD_DIR, filename)
    
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail=f"File not found: {filename}")
    
    # Optionally clear existing data
    if clear_existing:
        logger.info("Clearing existing ERA data...")
        # Clear matches first due to FK constraint
        db.execute(text("DELETE FROM era_matches"))
        
        # Then clear records
        deleted = db.query(ERARecord).delete()
        db.query(ERAUpload).delete()
        db.commit()
        logger.info(f"Cleared {deleted} existing ERA records")
    
    # Create upload record
    upload = ERAUpload(
        filename=filename,
        state=filename.split('_')[-1].replace('.txt', '')[:3],
        uploaded_by=current_user.id
    )
    db.add(upload)
    db.commit()
    db.refresh(upload)
    
    # Start background parsing
    background_tasks.add_task(process_era_file, file_path, upload.id)
    
    return {
        "message": f"Started parsing {filename} from disk",
        "upload_id": upload.id,
        "cleared_existing": clear_existing
    }


@router.get("/uploads")
def list_era_uploads(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """List all ERA file uploads with status."""
    uploads = db.query(ERAUpload).order_by(ERAUpload.uploaded_at.desc()).all()
    return [
        {
            "id": u.id,
            "filename": u.filename,
            "state": u.state,
            "record_count": u.record_count,
            "status": getattr(u, 'status', 'complete'),  # Fallback if column missing
            "error_message": getattr(u, 'error_message', None),
            "uploaded_at": u.uploaded_at.isoformat() if u.uploaded_at else None
        }
        for u in uploads
    ]


@router.get("/stats")
def era_statistics(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Get ERA database statistics."""
    return get_era_stats(db)


@router.delete("/uploads/{upload_id}")
def delete_era_upload(
    upload_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Delete an ERA upload and all its records."""
    upload = db.query(ERAUpload).filter(ERAUpload.id == upload_id).first()
    if not upload:
        raise HTTPException(status_code=404, detail="Upload not found")
    
    db.execute(text("DELETE FROM era_matches WHERE era_record_id IN (SELECT id FROM era_records WHERE upload_id = :uid)"), {"uid": upload_id})
    
    db.delete(upload)  # Cascade deletes records
    db.commit()
    return {"message": f"Deleted upload {upload_id}"}


@router.post("/verify/{upload_id}")
def verify_era_upload(
    upload_id: int,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Verify and repair an ERA upload by re-scanning the file
    and inserting any missing records.
    
    This is useful after crashes, duplicate cleanup, or any other
    situation where records may have been lost.
    """
    upload = db.query(ERAUpload).filter(ERAUpload.id == upload_id).first()
    if not upload:
        raise HTTPException(status_code=404, detail="Upload not found")
    
    file_path = os.path.join(ERA_UPLOAD_DIR, upload.filename)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail=f"File not found on disk: {upload.filename}")
    
    # Run verification in background
    background_tasks.add_task(run_verification, upload_id, file_path)
    
    return {
        "message": f"Verification started for {upload.filename}",
        "upload_id": upload_id,
        "current_record_count": upload.record_count
    }


def run_verification(upload_id: int, file_path: str):
    """Background task for verification."""
    from ..database import SessionLocal
    
    db = SessionLocal()
    try:
        upload = db.query(ERAUpload).filter(ERAUpload.id == upload_id).first()
        if upload:
            before_count = upload.record_count
            repaired = verify_and_repair_era_file(db, file_path, upload)
            after_count = upload.record_count
            logger.info(f"Verification complete for {file_path}: {repaired} records repaired. Count: {before_count} -> {after_count}")
    except Exception as e:
        logger.error(f"Verification error: {e}")
    finally:
        db.close()


# ============================================================================
# ERA Search & Matching
# ============================================================================

@router.post("/search", response_model=List[ERASearchResponse])
def search_era(
    request: ERASearchRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Fuzzy search ERA records by name and optional address.
    """
    results = search_era_records(
        db,
        surname=request.surname,
        given_names=request.given_names,
        locality=request.locality,
        postcode=request.postcode,
        limit=request.limit,
        threshold=request.threshold
    )
    return [ERASearchResponse(**r.__dict__) for r in results]


@router.post("/match-member/{member_id}")
def match_member(
    member_id: int,
    threshold: int = MATCH_THRESHOLD,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Match a specific member against ERA records.
    If a match is found above threshold, creates a CheckResult with ERA data.
    """
    member = db.query(Member).filter(Member.id == member_id).first()
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")
    
    result = match_member_to_era(db, member, threshold)
    
    if result:
        # Save match
        match = save_era_match(db, member_id, result)
        
        # Create CheckResult if score is high enough (ERA takes precedence)
        if result.overall_score >= threshold:
            check = CheckResult(
                member_id=member_id,
                result="Pass" if result.overall_score >= 90 else "Partial",
                federal_division=result.federal_division,
                state_division=result.state_district,
                local_government=result.local_government_area,
                verification_method='era'
            )
            db.add(check)
            db.commit()
        
        return {
            "status": "matched",
            "score": result.overall_score,
            "match": ERASearchResponse(**result.__dict__),
            "check_result_created": result.overall_score >= threshold
        }
    
    return {
        "status": "no_match",
        "message": f"No ERA match found above {threshold}% threshold"
    }


@router.post("/batch-match")
def batch_match_members(
    member_ids: List[int],
    threshold: int = MATCH_THRESHOLD,
    background_tasks: BackgroundTasks = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Batch match multiple members against ERA records.
    Runs in background for large batches.
    """
    if len(member_ids) > 10:
        background_tasks.add_task(
            run_batch_matching, member_ids, threshold
        )
        return {
            "status": "queued",
            "message": f"Batch matching {len(member_ids)} members in background"
        }
    
    results = []
    for mid in member_ids:
        member = db.query(Member).filter(Member.id == mid).first()
        if member:
            match = match_member_to_era(db, member, threshold)
            results.append({
                "member_id": mid,
                "status": "matched" if match else "no_match",
                "score": match.overall_score if match else 0
            })
    
    return {"results": results}


def run_batch_matching(member_ids: List[int], threshold: int):
    """Background task for batch matching."""
    from ..database import SessionLocal
    
    db = SessionLocal()
    try:
        for mid in member_ids:
            member = db.query(Member).filter(Member.id == mid).first()
            if member:
                result = match_member_to_era(db, member, threshold)
                if result:
                    save_era_match(db, mid, result)
                    if result.overall_score >= threshold:
                        check = CheckResult(
                            member_id=mid,
                            result="Pass" if result.overall_score >= 90 else "Partial",
                            federal_division=result.federal_division,
                            state_division=result.state_district,
                            local_government=result.local_government_area,
                            verification_method='era'
                        )
                        db.add(check)
        db.commit()
    finally:
        db.close()


# ============================================================================
# Recruitment Targeting Features
# ============================================================================

@router.get("/household/{member_id}", response_model=HouseholdResponse)
def get_household_members(
    member_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Find all people at the same address as a member.
    Useful for household recruitment targeting.
    """
    member = db.query(Member).filter(Member.id == member_id).first()
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")
    
    # Find ERA records at the same address
    household = db.query(ERARecord).filter(
        ERARecord.post_code == member.primary_zip,
        ERARecord.locality_name.ilike(f"%{member.primary_city}%") if member.primary_city else True,
        ERARecord.full_address.ilike(f"%{member.primary_address1[:10]}%") if member.primary_address1 else True
    ).limit(50).all()
    
    # Check which are existing members
    existing_surnames = {
        normalize_name(m.last_name): m.id 
        for m in db.query(Member).filter(Member.primary_zip == member.primary_zip).all()
    }
    
    members_list = [
        HouseholdMember(
            era_record_id=h.id,
            given_names=h.given_names or '',
            surname=h.surname or '',
            gender=h.gender or '',
            date_of_birth=h.date_of_birth,
            is_existing_member=normalize_name(h.surname) in existing_surnames
        )
        for h in household
    ]
    
    return HouseholdResponse(
        address=member.primary_address1 or '',
        locality=member.primary_city or '',
        postcode=member.primary_zip or '',
        federal_division=household[0].federal_division if household else '',
        members=members_list,
        total_at_address=len(household)
    )


@router.get("/related-surnames/{member_id}")
def find_related_by_surname(
    member_id: int,
    same_locality: bool = True,
    limit: int = 50,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Find people with the same surname as a member.
    Can filter to same locality for more targeted results.
    """
    member = db.query(Member).filter(Member.id == member_id).first()
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")
    
    surname_norm = normalize_name(member.last_name)
    if not surname_norm:
        raise HTTPException(status_code=400, detail="Member has no surname")
    
    query = db.query(ERARecord).filter(
        ERARecord.surname_normalized == surname_norm
    )
    
    if same_locality and member.primary_city:
        query = query.filter(
            ERARecord.locality_name.ilike(f"%{member.primary_city}%")
        )
    
    matches = query.limit(limit).all()
    
    # Exclude existing members
    existing = {
        (normalize_name(m.last_name), normalize_name(m.first_name))
        for m in db.query(Member).filter(
            func.lower(Member.last_name) == surname_norm
        ).all()
    }
    
    return [
        {
            "era_record_id": m.id,
            "given_names": m.given_names,
            "surname": m.surname,
            "full_address": m.full_address,
            "locality": m.locality_name,
            "postcode": m.post_code,
            "federal_division": m.federal_division,
            "is_existing_member": (normalize_name(m.surname), normalize_name(m.given_names)) in existing
        }
        for m in matches
    ]


@router.get("/recruitment-targets")
def find_recruitment_targets(
    federal_division: Optional[str] = None,
    locality: Optional[str] = None,
    include_same_address: bool = True,
    include_same_surname: bool = True,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Find potential recruitment targets based on existing members.
    Identifies people at same addresses or with same surnames.
    """
    targets = []
    
    # Get existing members (optionally filtered)
    member_query = db.query(Member)
    if federal_division:
        member_query = member_query.join(Member.check_results).filter(
            CheckResult.federal_division == federal_division
        )
    
    members = member_query.limit(500).all()
    
    for member in members:
        member_name = f"{member.first_name} {member.last_name}"
        
        # Find same address
        if include_same_address and member.primary_address1:
            same_addr = db.query(ERARecord).filter(
                ERARecord.post_code == member.primary_zip,
                ERARecord.full_address.ilike(f"%{member.primary_address1[:15]}%")
            ).limit(10).all()
            
            for era in same_addr:
                targets.append(RecruitmentTargetResponse(
                    era_record_id=era.id,
                    given_names=era.given_names or '',
                    surname=era.surname or '',
                    full_address=era.full_address or '',
                    federal_division=era.federal_division or '',
                    relationship_type='same_address',
                    related_member_id=member.id,
                    related_member_name=member_name
                ))
        
        # Find same surname
        if include_same_surname and member.last_name:
            surname_norm = normalize_name(member.last_name)
            same_surname = db.query(ERARecord).filter(
                ERARecord.surname_normalized == surname_norm,
                ERARecord.locality_name == member.primary_city if locality else True
            ).limit(10).all()
            
            for era in same_surname:
                # Avoid duplicates
                if era.id not in [t.era_record_id for t in targets]:
                    targets.append(RecruitmentTargetResponse(
                        era_record_id=era.id,
                        given_names=era.given_names or '',
                        surname=era.surname or '',
                        full_address=era.full_address or '',
                        federal_division=era.federal_division or '',
                        relationship_type='same_surname',
                        related_member_id=member.id,
                        related_member_name=member_name
                    ))
        
        if len(targets) >= limit:
            break
    
    return targets[:limit]


@router.get("/browse")
def browse_era_records(
    federal_division: Optional[str] = None,
    locality: Optional[str] = None,
    postcode: Optional[str] = None,
    surname_starts_with: Optional[str] = None,
    skip: int = 0,
    limit: int = 50,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Browse ERA records with filters.
    Provides a general interface to explore the electoral roll.
    """
    query = db.query(ERARecord)
    
    if federal_division:
        query = query.filter(ERARecord.federal_division == federal_division)
    if locality:
        query = query.filter(ERARecord.locality_name.ilike(f"%{locality}%"))
    if postcode:
        query = query.filter(ERARecord.post_code == postcode)
    if surname_starts_with:
        query = query.filter(
            ERARecord.surname_normalized.like(f"{surname_starts_with.lower()}%")
        )
    
    total = query.count()
    records = query.offset(skip).limit(limit).all()
    
    return {
        "total": total,
        "skip": skip,
        "limit": limit,
        "records": [
            {
                "id": r.id,
                "given_names": r.given_names,
                "surname": r.surname,
                "full_address": r.full_address,
                "locality": r.locality_name,
                "postcode": r.post_code,
                "federal_division": r.federal_division,
                "state_district": r.state_district,
                "enrolled_date": r.enrolled_date
            }
            for r in records
        ]
    }


@router.get("/divisions")
def list_federal_divisions(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Get list of federal divisions in ERA data with counts."""
    divisions = db.query(
        ERARecord.federal_division,
        func.count(ERARecord.id).label('count')
    ).group_by(ERARecord.federal_division).order_by(
        ERARecord.federal_division
    ).all()
    
    return [{"division": d, "count": c} for d, c in divisions if d]


@router.get("/localities")
def list_localities(
    federal_division: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Get list of localities (suburbs) in ERA data with counts."""
    query = db.query(
        ERARecord.locality_name,
        ERARecord.post_code,
        func.count(ERARecord.id).label('count')
    )
    
    if federal_division:
        query = query.filter(ERARecord.federal_division == federal_division)
    
    localities = query.group_by(
        ERARecord.locality_name, ERARecord.post_code
    ).order_by(ERARecord.locality_name).limit(500).all()
    
    return [{"locality": l, "postcode": p, "count": c} for l, p, c in localities if l]


# ============================================================================
# Household Analytics & Conversion Tracking
# ============================================================================

@router.get("/household-stats")
def household_statistics(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Get aggregate household conversion statistics.
    Provides campaign intelligence on member penetration at household level.
    """
    stats = get_household_stats(db)
    return {
        "total_households_with_members": stats.total_households_with_members,
        "total_electors_in_member_households": stats.total_electors_in_member_households,
        "total_members_matched": stats.total_members_matched,
        "average_conversion_rate": stats.average_conversion_rate,
        "tier_breakdown": stats.tier_breakdown
    }


@router.get("/household/{member_id}")
def member_household_details(
    member_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Get household details for a specific member.
    Shows conversion rate, other household members, and join timeline.
    """
    household = get_member_household(db, member_id)
    if not household:
        raise HTTPException(status_code=404, detail="Member household not found or no address data")
    
    return {
        "household_id": household.household_id,
        "address": household.address,
        "locality": household.locality,
        "postcode": household.postcode,
        "federal_division": household.federal_division,
        "total_electors": household.total_electors,
        "member_count": household.member_count,
        "conversion_rate": household.conversion_rate,
        "conversion_tier": household.conversion_tier,
        "member_names": household.member_names,
        "first_member_join": household.first_member_join,
        "latest_member_join": household.latest_member_join
    }


@router.get("/top-households")
def top_converting_households(
    limit: int = 20,
    min_electors: int = 2,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Get households with highest conversion rates.
    Useful for identifying natural advocates and strong local presence.
    """
    return get_top_converting_households(db, limit=limit, min_electors=min_electors)


@router.get("/volunteer-candidates")
def volunteer_candidates(
    min_rate: float = 75.0,
    limit: int = 50,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Find members whose households have high conversion rates.
    These natural advocates are prime candidates for volunteer recruitment.
    
    Args:
        min_rate: Minimum household conversion rate (default 75%)
        limit: Maximum number of candidates to return
    """
    return get_high_converting_members(db, min_rate=min_rate, limit=limit)

