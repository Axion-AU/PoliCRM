from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, UploadFile, File, Query
from sqlalchemy.orm import Session, joinedload, aliased
from typing import List, Optional
from datetime import datetime, timedelta
import csv
import io
import logging

from ..database import get_db
from ..models import Member, MemberNote, Tag, User, CheckResult, Party, AuditLog
from ..schemas import (
    MemberCreate, MemberResponse, MemberUpdate,
    MemberNoteCreate, MemberNoteResponse, PaginatedMemberResponse
)
from ..dependencies import browser_pool, get_current_active_user, get_current_admin_user
from ..services.audit import log_action

logger = logging.getLogger(__name__)

router = APIRouter()

@router.post("", response_model=MemberResponse)
def create_member(member: MemberCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_active_user)):
    # ... (rest of create_member) ...
    db_member = db.query(Member).filter(Member.nationbuilder_id == member.nationbuilder_id).first()
    if db_member:
        raise HTTPException(status_code=400, detail="Member already registered")
    
    new_member = Member(**member.dict())
    db.add(new_member)
    db.commit()
    db.refresh(new_member)
    
    try:
        browser_pool.enqueue_check(new_member.id)
    except Exception as e:
        logger.error(f"Failed to auto-queue check: {e}")
    
    return new_member

from fastapi.responses import StreamingResponse
from sqlalchemy import func, or_


def apply_filters(query, db, status, state, search, tags, tag_operator):
    # Apply filters
    if status and "all" not in status:
        # Alias for the latest check result to avoid conflicts with joinedload
        LatestCheckResult = aliased(CheckResult)
        
        # Subquery to get latest check result ID for each member
        # Must include member_id in select to join on it
        latest_checks_subquery = db.query(
            CheckResult.member_id,
            func.max(CheckResult.id).label("max_id")
        ).group_by(CheckResult.member_id).subquery()
        
        # Join Member -> Subquery
        query = query.outerjoin(
            latest_checks_subquery,
            Member.id == latest_checks_subquery.c.member_id
        )
        
        # Join Subquery -> LatestCheckResult
        query = query.outerjoin(
            LatestCheckResult,
            LatestCheckResult.id == latest_checks_subquery.c.max_id
        )
        
        status_filters = []
        # Handle single string case if passed as string
        if isinstance(status, str):
            status = [status]
            
        for s in status:
            if s == "Verified":
                status_filters.append(LatestCheckResult.result == "Pass")
            elif s == "Partial":
                status_filters.append(LatestCheckResult.result == "Partial")
            elif s == "Captcha":
                status_filters.append(LatestCheckResult.result == "Captcha")
            elif s == "Duplicate":
                status_filters.append(Member.is_duplicate == True)
            elif s == "Fail":
                status_filters.append(or_(
                    LatestCheckResult.result == "Fail",
                    LatestCheckResult.result == "Fail_Suburb",
                    LatestCheckResult.result == "Fail_Street",
                    LatestCheckResult.result == "Fail_No_Match"
                ))
            elif s == "Unchecked":
                status_filters.append(LatestCheckResult.id == None)
                
        if status_filters:
            query = query.filter(or_(*status_filters))
        
    if state != "all":
        query = query.filter(Member.primary_state == state)
        
    if search:
        search = search.lower()
        if search.isdigit():
            query = query.filter(Member.nationbuilder_id == int(search))
        else:
            query = query.filter(
                or_(
                    Member.primary_state.ilike(f"%{search}%"),
                    Member.primary_zip.ilike(f"%{search}%")
                )
            )

    # Tag Filtering
    if tags:
        if tag_operator == "AND":
            # Must have ALL tags
            for tag_id in tags:
                query = query.filter(Member.tags.any(Tag.id == tag_id))
        else:
            # Must have ANY tag
            query = query.filter(Member.tags.any(Tag.id.in_(tags)))
            
    return query

@router.get("/export")
def export_members(
    status: Optional[List[str]] = Query(None),
    state: str = "all",
    search: Optional[str] = None,
    columns: Optional[List[str]] = Query(None),
    tags: Optional[List[int]] = Query(None),
    tag_operator: str = "AND",
    format: str = "nb", # Default to NationBuilder format
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    # Use eager loading for efficient export
    query = db.query(Member).options(
        joinedload(Member.check_results),
        joinedload(Member.tags),
        joinedload(Member.party)
    )
    query = apply_filters(query, db, status, state, search, tags, tag_operator)

    from ..era_models import ERAMatch, ERARecord

    def iter_csv(query):
        # Helper functions
        def get_status(member):
            if not member.check_results: return "Unchecked"
            res = member.check_results[-1].result
            return "Verified" if res == "Pass" else res

        def get_electorate(member):
            if not member.check_results: return ""
            res = member.check_results[-1]
            if res.result == "Pass":
                return f"{res.federal_division or ''} / {res.state_division or ''}"
            return ""

        def get_tags_with_check_result(member):
            tags = [t.name for t in member.tags]
            if member.check_results:
                last_check = member.check_results[-1]
                if last_check.timestamp:
                    # Format: YYYYMM-AECCheck_<RESULT>
                    # Use get_status logic for consistent result naming (e.g. Pass -> Verified)
                    res_str = "Verified" if last_check.result == "Pass" else last_check.result
                    date_str = last_check.timestamp.strftime('%Y%m')
                    check_tag = f"{date_str}-AECCheck_{res_str}"
                    tags.append(check_tag)
            return ",".join(tags)

        # NationBuilder Columns
        nb_cols = {
            "nationbuilder_id": lambda m: str(m.nationbuilder_id),
            "first_name": lambda m: m.first_name,
            "last_name": lambda m: m.last_name,
            "email": lambda m: m.email or "",
            "mobile_number": lambda m: m.mobile or "",
            "phone_number": lambda m: m.phone or "",
            "primary_address1": lambda m: m.primary_address1,
            "primary_address2": lambda m: m.primary_address2 or "",
            "primary_city": lambda m: m.primary_city,
            "primary_state": lambda m: m.primary_state,
            "primary_zip": lambda m: m.primary_zip,
            "primary_country_code": lambda m: m.primary_country_code or "AU",
            "dob": lambda m: getattr(m, "_export_dob", None) or "",
            "aec_result": lambda m: get_status(m),
            "tags": lambda m: get_tags_with_check_result(m)
        }

        # Standard CSV Columns
        standard_cols = {
            "first_name": ("First Name", lambda m: m.first_name),
            "last_name": ("Last Name", lambda m: m.last_name),
            "nationbuilder_id": ("NB ID", lambda m: str(m.nationbuilder_id)),
            "email": ("Email", lambda m: m.email or ""),
            "phone": ("Phone", lambda m: m.phone or ""),
            "address": ("Address", lambda m: f"{m.primary_address1}, {m.primary_city}, {m.primary_state} {m.primary_zip}"),
            "status": ("Status", lambda m: get_status(m)),
            "electorate": ("Electorate", lambda m: get_electorate(m)),
            "dob": ("Date of Birth", lambda m: getattr(m, "_export_dob", None) or ""),
            "party": ("Party", lambda m: m.party.name if m.party else "")
        }
        
        # VEC Specific Columns
        vec_cols = {
            "Surname": lambda m: m.last_name,
            "Given Names": lambda m: f"{m.first_name} {m.middle_name or ''}".strip(),
            "Address": lambda m: f"{m.primary_address1} {m.primary_address2 or ''}".strip(),
            "Suburb": lambda m: m.primary_city,
            "Postcode": lambda m: m.primary_zip,
            "Date of Birth": lambda m: getattr(m, "_export_dob", None) or "", 
            "Phone": lambda m: m.phone or m.mobile or ""
        }
        
        # AEC Specific Columns
        aec_cols = {
            "MemberID": lambda m: str(m.nationbuilder_id),
            "FirstName": lambda m: m.first_name,
            "MiddleName": lambda m: m.middle_name or "",
            "Surname": lambda m: m.last_name,
            "AddressLine1": lambda m: m.primary_address1,
            "AddressLine2": lambda m: m.primary_address2 or "",
            "Locality": lambda m: m.primary_city,
            "State": lambda m: m.primary_state,
            "Postcode": lambda m: m.primary_zip
        }

        # Select columns based on format
        if format == "nb":
            final_cols = nb_cols
            header = list(nb_cols.keys())
        elif format == "vec":
            final_cols = vec_cols
            header = list(vec_cols.keys())
        elif format == "aec":
            final_cols = aec_cols
            header = list(aec_cols.keys())
        else:
            # Standard CSV (default fallback if not nb)
            selected_keys = columns if columns else standard_cols.keys()
            selected_keys = [k for k in selected_keys if k in standard_cols]
            final_cols = {k: standard_cols[k][1] for k in selected_keys}
            header = [standard_cols[k][0] for k in selected_keys]
        
        # Header
        yield ",".join(header) + "\n"
        
        # Batch fetch
        limit = 1000
        offset = 0
        while True:
            # Query needs distinct if we joined for filtering?
            # apply_filters might induce joins, but we fetch Member entities.
            # Distinct on Member.id is checking.
            batch = query.distinct(Member.id).offset(offset).limit(limit).all()
            if not batch:
                break
                
            # Bulk fetch DOB to avoid N+1 query issue
            member_ids = [m.id for m in batch]
            dob_map = {}
            if member_ids:
                matches = db.query(ERAMatch, ERARecord.date_of_birth).join(
                    ERARecord, ERAMatch.era_record_id == ERARecord.id
                ).filter(
                    ERAMatch.member_id.in_(member_ids)
                ).all()
                
                from collections import defaultdict
                member_matches = defaultdict(list)
                for match_obj, dob in matches:
                    member_matches[match_obj.member_id].append((match_obj, dob))
                
                for m_id, m_list in member_matches.items():
                    # Sort by overall_score descending to get the best match
                    best_match = sorted(m_list, key=lambda x: (x[0].overall_score or 0), reverse=True)[0]
                    dob_map[m_id] = best_match[1]
                
            for member in batch:
                # Pre-calculate export dob to prevent the property getter from querying
                if member.check_results and member.check_results[-1].result in ["Pass", "Partial"]:
                    member._export_dob = dob_map.get(member.id)
                else:
                    member._export_dob = None
                    
                row = []
                # Dict-based extractors (nb, vec, aec)
                if format in ["nb", "vec", "aec"]:
                     for col_name, extractor in final_cols.items():
                        val = extractor(member)
                        val = str(val).replace('"', '""')
                        row.append(f'"{val}"')
                else:
                    # Tuple-based extractors (standard)
                    for k in selected_keys:
                        val = standard_cols[k][1](member)
                        val = str(val).replace('"', '""')
                        row.append(f'"{val}"')
                yield ",".join(row) + "\n"
            
            offset += limit
            
    # Filename Logic: YY-MM_AECResult_<RESULT>
    date_str = datetime.now().strftime("%y-%m")
    
    result_str = "All"
    if status:
        if len(status) == 1:
            result_str = status[0]
        else:
            result_str = "Filtered"
            
    filename = f"{date_str}_AECResult_{result_str}"
    if format == "nb":
        filename += "_NationBuilder" # Optional specific suffix? User asked for "YY-MM_AECResult_<RESULT>" specifically.
        # User request: "YY-MM_AECResult_<RESULT>"
        # so I should stick to that EXACTLY.
        filename = f"{date_str}_AECResult_{result_str}"
        
    filename += ".csv"
    
    headers = {"Content-Disposition": f"attachment; filename={filename}"}
    return StreamingResponse(iter_csv(query), media_type="text/csv", headers=headers)
    response.headers["Content-Disposition"] = f"attachment; filename={filename}"
    return response

@router.get("/parties")
def get_parties(db: Session = Depends(get_db), current_user: User = Depends(get_current_active_user)):
    return db.query(Party).all()

@router.get("", response_model=PaginatedMemberResponse)
def read_members(
    skip: int = 0, 
    limit: int = 20, 
    status: Optional[List[str]] = Query(None),
    state: str = "all",
    search: Optional[str] = None,
    tags: Optional[List[int]] = Query(None),
    tag_operator: str = "AND",
    db: Session = Depends(get_db), 
    current_user: User = Depends(get_current_active_user)
):
    # Eager load relationships to avoid N+1 and ensure data exists
    query = db.query(Member).options(
        joinedload(Member.check_results),
        joinedload(Member.tags),
        joinedload(Member.party)
    )
    
    # If search is present, we must do in-memory filtering for encrypted fields
    if search:
        # Apply strict SQL filters first (status, state, tags)
        # Pass search=None to apply_filters to skip SQL-based searching
        query = apply_filters(query, db, status, state, None, tags, tag_operator)
        
        # Fetch all candidates (distinct to avoid join duplicates)
        candidates = query.distinct(Member.id).all()
        
        # Python-side fuzzy search on decrypted fields
        search_lower = search.lower()
        filtered_members = []
        for m in candidates:
            if (
                search_lower in (m.first_name or "").lower() or
                search_lower in (m.last_name or "").lower() or
                search_lower in (m.email or "").lower() or
                search_lower in (m.primary_address1 or "").lower() or
                search_lower in (m.primary_city or "").lower() or
                search_lower in (m.primary_zip or "") or
                search_lower in (m.primary_state or "").lower() or
                (str(m.nationbuilder_id) == search)
            ):
                filtered_members.append(m)
        
        total = len(filtered_members)
        # In-memory pagination
        members = filtered_members[skip : skip + limit]
        
    else:
        # Standard SQL filtering and pagination
        query = apply_filters(query, db, status, state, None, tags, tag_operator)
        
        # distinct() because joinedload might duplicate rows in result set for filtering
        total = query.distinct(Member.id).count()
        
        members = query.offset(skip).limit(limit).all()
    
    return {
        "members": members,
        "total": total,
        "skip": skip,
        "limit": limit
    }

@router.get("/{member_id}", response_model=MemberResponse)
def read_member(member_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_active_user)):
    member = db.query(Member).filter(Member.id == member_id).first()
    if member is None:
        raise HTTPException(status_code=404, detail="Member not found")
    return member

@router.put("/{member_id}", response_model=MemberResponse)
def update_member(member_id: int, member_update: MemberUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_current_active_user)):
    member = db.query(Member).filter(Member.id == member_id).first()
    if member is None:
        raise HTTPException(status_code=404, detail="Member not found")
    
    update_data = member_update.dict(exclude_unset=True)
    
    # Track changes for audit log
    changes = {}
    for key, value in update_data.items():
        old_value = getattr(member, key)
        if old_value != value:
            changes[key] = {"old": str(old_value), "new": str(value)}
            setattr(member, key, value)
    
    if changes:
        db.commit()
        db.refresh(member)
        
        # Log action
        log_action(
            db,
            user_id=current_user.id,
            action="MEMBER_UPDATE",
            target_type="MEMBER",
            target_id=member.id,
            details=changes,
            ip_address="127.0.0.1" # TODO: Get real IP
        )
        
    return member

@router.delete("/{member_id}")
def delete_member(member_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_admin_user)):
    # Only admins can delete
    member = db.query(Member).filter(Member.id == member_id).first()
    if member is None:
        raise HTTPException(status_code=404, detail="Member not found")
    
    db.delete(member)
    db.commit()
    return {"message": "Member deleted successfully"}

@router.post("/{member_id}/notes", response_model=MemberNoteResponse)
def add_member_note(member_id: int, note: MemberNoteCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_active_user)):
    member = db.query(Member).filter(Member.id == member_id).first()
    if member is None:
        raise HTTPException(status_code=404, detail="Member not found")
    
    # Use current user's email/name as creator
    creator = current_user.email or "Unknown"
    
    new_note = MemberNote(member_id=member_id, note=note.note, created_by=creator)
    db.add(new_note)
    db.commit()
    db.refresh(new_note)
    return new_note

@router.post("/{member_id}/tags/{tag_id}")
def add_tag_to_member(member_id: int, tag_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_active_user)):
    member = db.query(Member).filter(Member.id == member_id).first()
    tag = db.query(Tag).filter(Tag.id == tag_id).first()
    
    if not member or not tag:
        raise HTTPException(status_code=404, detail="Member or tag not found")
    
    if tag not in member.tags:
        member.tags.append(tag)
        db.commit()
    
    return {"message": "Tag added to member"}

@router.delete("/{member_id}/tags/{tag_id}")
def remove_tag_from_member(member_id: int, tag_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_active_user)):
    member = db.query(Member).filter(Member.id == member_id).first()
    tag = db.query(Tag).filter(Tag.id == tag_id).first()
    
    if not member or not tag:
        raise HTTPException(status_code=404, detail="Member or tag not found")
    
    if tag in member.tags:
        member.tags.remove(tag)
        db.commit()
    
    return {"message": "Tag removed from member"}

@router.post("/{member_id}/check")
def check_member(member_id: int, background_tasks: BackgroundTasks, db: Session = Depends(get_db), current_user: User = Depends(get_current_active_user)):
    member = db.query(Member).filter(Member.id == member_id).first()
    if member is None:
        raise HTTPException(status_code=404, detail="Member not found")
    
    browser_pool.enqueue_check(member_id)
    return {"status": "queued", "message": f"Check queued for member {member_id}"}

@router.post("/{member_id}/reset-status")
def reset_member_status(member_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_active_user)):
    """
    Clears all check results for a member, effectively resetting them to 'Unchecked' status.
    Useful for clearing Failed or Captcha states to retry cleanly.
    """
    member = db.query(Member).filter(Member.id == member_id).first()
    if member is None:
        raise HTTPException(status_code=404, detail="Member not found")
    
    # Delete all check results for this member
    db.query(CheckResult).filter(CheckResult.member_id == member_id).delete()
    
    # Also reset duplicate status if they want a fresh start? 
    # Maybe optional, but for now let's just do check results as that's the main request.
    
    db.commit()
    return {"message": "Member status reset to Unchecked"}

@router.post("/upload")
async def upload_members(file: UploadFile = File(...), db: Session = Depends(get_db), current_user: User = Depends(get_current_active_user)):
    contents = await file.read()
    decoded = contents.decode('utf-8')
    
    # Handle duplicate headers (e.g. middle_name appearing twice)
    stream = io.StringIO(decoded)
    reader = csv.reader(stream)
    try:
        headers = next(reader)
    except StopIteration:
        return {"message": "Empty CSV file", "errors": 1}
        
    # Deduplicate headers
    seen_headers = {}
    unique_headers = []
    for h in headers:
        if h in seen_headers:
            seen_headers[h] += 1
            unique_headers.append(f"{h}_{seen_headers[h]}")
        else:
            seen_headers[h] = 1
            unique_headers.append(h)
            
    csv_reader = csv.DictReader(stream, fieldnames=unique_headers)
    
    count = 0
    errors = 0
    skipped = 0
    queued = 0
    new_member_ids = []
    
    updated = 0
    
    for row in csv_reader:
        try:
            nb_id = int(row.get("nationbuilder_id", 0))
            if not nb_id:
                skipped += 1
                continue
                
            # Check if member exists
            existing_member = db.query(Member).filter(Member.nationbuilder_id == nb_id).first()
            
            if existing_member:
                # Update existing member
                # We only update fields if they are present in the CSV and not empty
                # Special focus on middle_name as requested
                
                changed = False
                
                # Middle Name
                middle_name = row.get("middle_name")
                
                if middle_name and existing_member.middle_name != middle_name:
                    existing_member.middle_name = middle_name
                    changed = True
                    
                # Update other key fields if they are missing in DB or different
                # Note: Be careful not to overwrite valid data with empty strings if CSV has gaps
                
                fields_to_update = [
                    "first_name", "last_name", "email", "phone", "mobile",
                    "primary_address1", "primary_address2", "primary_address3",
                    "primary_city", "primary_state", "primary_zip", "primary_country_code",
                    "membership_status"
                ]
                
                for field in fields_to_update:
                    val = row.get(field)
                    if val: # Only update if CSV has a value
                        current_val = getattr(existing_member, field)
                        if current_val != val:
                            setattr(existing_member, field, val)
                            changed = True
                
                if changed:
                    updated += 1
                    # If we updated the member, we might want to re-queue a check
                    # especially if name/address changed
                    if existing_member.id not in new_member_ids:
                        new_member_ids.append(existing_member.id)
                else:
                    skipped += 1
                    
            else:
                # Create new member
                member = Member(
                    first_name=row.get("first_name", ""),
                    middle_name=row.get("middle_name"),
                    last_name=row.get("last_name", ""),
                    nationbuilder_id=nb_id,
                    email=row.get("email"),
                    phone=row.get("phone"),
                    mobile=row.get("mobile"),
                    primary_address1=row.get("primary_address1", ""),
                    primary_address2=row.get("primary_address2"),
                    primary_address3=row.get("primary_address3"),
                    primary_city=row.get("primary_city", ""),
                    primary_state=row.get("primary_state", "").upper(),
                    primary_zip=row.get("primary_zip", ""),
                    primary_country_code=row.get("primary_country_code", "AU"),
                    membership_status=row.get("membership_status", "active")
                )
                db.add(member)
                db.flush()
                new_member_ids.append(member.id)
                count += 1
                
        except Exception as e:
            errors += 1
            logger.error(f"Error importing row: {e}")
            
    db.commit()
    
    for member_id in new_member_ids:
        try:
            browser_pool.enqueue_check(member_id)
            queued += 1
        except Exception as e:
            logger.error(f"Error queuing check for member {member_id}: {e}")
    
    return {
        "message": f"Import complete: {count} new, {updated} updated", 
        "errors": errors,
        "skipped": skipped,
        "queued": queued
    }



@router.post("/detect-duplicates")
def detect_duplicates(background_tasks: BackgroundTasks, db: Session = Depends(get_db), current_user: User = Depends(get_current_active_user)):
    """
    Background task to detect duplicates based on Name + Address.
    """
    background_tasks.add_task(run_duplicate_detection, db)
    return {"message": "Duplicate detection started in background"}

def run_duplicate_detection(db: Session):
    logger.info("Starting duplicate detection...")
    try:
        # Reset current duplicates
        db.query(Member).update({Member.is_duplicate: False, Member.duplicate_of_id: None})
        db.commit()
        
        # Fetch all members (this might be heavy for 8k, but manageable)
        # For 8k members, we can fetch all ID, Name, Address
        members = db.query(Member).all()
        
        # Group by key
        seen = {}
        duplicates_count = 0
        
        for member in members:
            # Create a normalization key
            # Note: These fields are encrypted types in the model, but when accessed via ORM they are decrypted.
            # So we can use them for comparison.
            key = (
                (member.first_name or "").lower().strip(),
                (member.last_name or "").lower().strip(),
                (member.primary_address1 or "").lower().strip(),
                (member.primary_zip or "").strip()
            )
            
            if key in seen:
                # Found a duplicate
                original_id = seen[key]
                member.is_duplicate = True
                member.duplicate_of_id = original_id
                duplicates_count += 1
            else:
                seen[key] = member.id
        
        db.commit()
        logger.info(f"Duplicate detection complete. Found {duplicates_count} duplicates.")
        
    except Exception as e:
        logger.error(f"Error in duplicate detection: {e}")

