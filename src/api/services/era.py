"""
ERA (Electoral Roll Access) parsing and fuzzy matching service.
Handles parsing of AEC ERA .txt files and fuzzy matching against member data.
"""
import csv
import logging
from typing import List, Dict, Optional, Tuple, Generator
from dataclasses import dataclass
from datetime import datetime, timedelta
from rapidfuzz import fuzz, process
from sqlalchemy.orm import Session
from sqlalchemy import func, or_

from ..era_models import ERARecord, ERAUpload, ERAMatch
from ..models import Member

logger = logging.getLogger(__name__)

# Default fuzzy match threshold (0-100)
MATCH_THRESHOLD = 80

# Weight distribution for composite scoring
NAME_WEIGHT = 0.70  # 70% weight for name match
ADDRESS_WEIGHT = 0.30  # 30% weight for address match


@dataclass
class ERASearchResult:
    """Result from fuzzy searching ERA records."""
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


# Column mapping for ERA file (0-indexed)
ERA_COLUMNS = {
    'enrolment_state': 0,
    'transaction_number': 1,
    'federal_direct_indicator': 2,
    'title': 3,
    'given_names': 4,
    'surname': 5,
    'date_of_birth': 6,
    'gender': 7,
    'habitation_name': 8,
    'flat_number': 9,
    'street_number': 10,
    'street_name': 11,
    'street_type': 12,
    'locality_name': 13,
    'post_code': 14,
    'state': 15,
    'full_address': 16,
    'enrolled_address_dpid': 17,
    'walk_number': 18,
    'enrolled_date': 19,
    'eligibility_flag': 20,
    'gpv_indicator': 21,
    'new_enrolment_flag': 22,
    'postal_address': 23,
    'postal_address_dpid': 24,
    'federal_division': 25,
    'federal_division_pre_redistribution': 26,
    'state_district': 27,
    'state_district_pre_redistribution': 28,
    'local_government_area': 29,
    'lga_pre_redistribution': 30,
    'sa1': 31,
    'mailing_name': 32,
    'mailing_address_line1': 33,
    'mailing_address_line2': 34,
    'mailing_address_line3': 35,
    'mailing_address_line4': 36,
    'prev_enrolment_state': 37,
    'prev_transaction_number': 38,
    'dual_enrolment_state': 39,
    'dual_transaction_number': 40,
}


def normalize_name(name: Optional[str]) -> str:
    """Normalize a name for fuzzy matching."""
    if not name:
        return ""
    return name.lower().strip()


def normalize_address(address: Optional[str]) -> str:
    """Normalize an address for fuzzy matching."""
    if not address:
        return ""
    # Lowercase, strip, remove common abbreviations
    addr = address.lower().strip()
    # Standardize common street type abbreviations
    replacements = {
        ' street': ' st',
        ' road': ' rd',
        ' avenue': ' ave',
        ' drive': ' dr',
        ' court': ' ct',
        ' place': ' pl',
        ' crescent': ' cres',
        ' parade': ' pde',
        ' highway': ' hwy',
        ' boulevard': ' blvd',
    }
    for full, abbr in replacements.items():
        addr = addr.replace(full, abbr)
    return addr


def parse_era_row(row: List[str]) -> Dict:
    """Parse a single ERA row into a dictionary."""
    if len(row) < 41:
        # Pad with empty strings if row is short
        row = row + [''] * (41 - len(row))
    
    result = {}
    for field, idx in ERA_COLUMNS.items():
        result[field] = row[idx].strip() if row[idx] else None
    
    # Add normalized fields for fuzzy matching
    result['surname_normalized'] = normalize_name(result['surname'])
    result['given_names_normalized'] = normalize_name(result['given_names'])
    
    return result


def parse_era_file(
    file_path: str,
    batch_size: int = 10000,  # Smaller batches for more frequent progress updates
    skip_rows: int = 0
) -> Generator[List[Dict], None, Tuple[int, int]]:
    """
    Parse an ERA .txt file in batches.
    
    Yields batches of parsed records as dictionaries.
    Returns (total_records, error_count) when complete.
    """
    import itertools
    
    total = 0
    errors = 0
    batch = []
    
    with open(file_path, 'r', encoding='utf-8', errors='replace') as f:
        reader = csv.reader(f, delimiter='\t')
        
        # Skip header row
        try:
            header = next(reader)
            logger.info(f"ERA file header has {len(header)} columns")
        except StopIteration:
            logger.error("ERA file is empty")
            return (0, 0)
            
        # Skip already processed rows if resuming
        if skip_rows > 0:
            logger.info(f"Resuming ERA import: skipping first {skip_rows:,} rows...")
            # consumes iterators at C speed
            next(itertools.islice(reader, skip_rows, skip_rows), None)
            total = skip_rows # Initialize total to skipped count so progress is accurate
        
        for row_num, row in enumerate(reader, start=2 + skip_rows):
            try:
                parsed = parse_era_row(row)
                batch.append(parsed)
                total += 1
                
                if len(batch) >= batch_size:
                    yield batch
                    batch = []
                    
                # Log progress every 25k records (more frequent updates)
                if total % 25000 == 0:
                    logger.info(f"Parsed {total:,} ERA records...")
                    
            except Exception as e:
                errors += 1
                if errors <= 10:
                    logger.warning(f"Error parsing row {row_num}: {e}")
        
        # Yield remaining batch
        if batch:
            yield batch
    
    logger.info(f"ERA parsing complete: {total:,} records, {errors} errors")
    return (total, errors)


def bulk_insert_era_records(
    db: Session,
    upload: ERAUpload,
    records: List[Dict]
) -> int:
    """
    Bulk insert ERA records for efficiency.
    Uses PostgreSQL COPY for 10-50x faster imports.
    """
    from ..database import is_sqlite
    
    if not records:
        return 0
    
    if is_sqlite:
        # SQLite: Use Core Insert with OR IGNORE
        from sqlalchemy import insert
        
        insert_data = []
        for rec in records:
            rec_with_id = rec.copy()
            rec_with_id['upload_id'] = upload.id
            insert_data.append(rec_with_id)
            
        stmt = insert(ERARecord).values(insert_data).prefix_with("OR IGNORE")
        db.execute(stmt)
        db.commit()
        return len(records)
    else:
        # PostgreSQL: Use COPY to temp table, then INSERT with conflict handling
        import io
        from sqlalchemy import text
        
        # Get raw connection for COPY command
        connection = db.connection().connection
        cursor = connection.cursor()
        
        # Column order for COPY (must match ERA_COLUMNS + normalized + upload_id)
        columns = list(ERA_COLUMNS.keys()) + ['surname_normalized', 'given_names_normalized', 'upload_id']
        
        try:
            # Create temp table for staging (faster than individual inserts)
            cursor.execute("""
                CREATE TEMP TABLE IF NOT EXISTS era_staging (LIKE era_records INCLUDING DEFAULTS)
                ON COMMIT DROP
            """)
            
            # Build CSV in memory
            buffer = io.StringIO()
            for rec in records:
                rec['upload_id'] = upload.id
                values = []
                for col in columns:
                    val = rec.get(col, '')
                    if val is None:
                        val = r'\N'
                    else:
                        val = str(val).replace('\\', '\\\\').replace('\t', ' ').replace('\n', ' ').replace('\r', '')
                    values.append(val)
                buffer.write('\t'.join(values) + '\n')
            
            buffer.seek(0)
            
            # COPY to staging table (super fast, no constraints)
            cursor.execute("TRUNCATE era_staging")
            cursor.copy_expert(
                f"COPY era_staging ({', '.join(columns)}) FROM STDIN WITH (FORMAT text, DELIMITER E'\\t', NULL '\\N')",
                buffer
            )
            
            # Insert from staging to real table, ignoring duplicates
            insert_cols = ', '.join(columns)
            cursor.execute(f"""
                INSERT INTO era_records ({insert_cols})
                SELECT {insert_cols} FROM era_staging
                ON CONFLICT DO NOTHING
            """)
            
            connection.commit()
            return len(records)
            
        except Exception as e:
            connection.rollback()
            logger.error(f"Bulk insert failed: {e}")
            raise


def calculate_match_score(
    member_surname: str,
    member_given: str,
    member_locality: str,
    member_postcode: str,
    era_surname: str,
    era_given: str,
    era_locality: str,
    era_postcode: str
) -> Tuple[int, int, int]:
    """
    Calculate fuzzy match score between member and ERA record.
    
    Returns: (overall_score, name_score, address_score)
    """
    # Name matching (70% weight)
    surname_score = fuzz.ratio(
        normalize_name(member_surname),
        normalize_name(era_surname)
    )
    # Use partial_ratio to handle "Ethan" matching "Ethan Christopher"
    given_score = fuzz.partial_ratio(
        normalize_name(member_given),
        normalize_name(era_given)
    )
    # Surname is more important than given names
    name_score = int(surname_score * 0.6 + given_score * 0.4)
    
    # Address matching (30% weight)
    locality_score = fuzz.ratio(
        normalize_name(member_locality),
        normalize_name(era_locality)
    )
    # Postcode exact match gets bonus
    postcode_match = 100 if member_postcode == era_postcode else 0
    address_score = int(locality_score * 0.5 + postcode_match * 0.5)
    
    # Overall weighted score
    overall_score = int(name_score * NAME_WEIGHT + address_score * ADDRESS_WEIGHT)
    
    return (overall_score, name_score, address_score)


def search_era_records(
    db: Session,
    surname: str,
    given_names: Optional[str] = None,
    locality: Optional[str] = None,
    postcode: Optional[str] = None,
    limit: int = 20,
    threshold: int = MATCH_THRESHOLD
) -> List[ERASearchResult]:
    """
    Fuzzy search ERA records by name and optional address.
    
    First filters by postcode/locality for efficiency, then applies fuzzy matching.
    """
    results = []
    
    # Determine if this is a name-only search (adjust scoring)
    name_only_search = not postcode and not locality
    
    # Build base query with filters
    query = db.query(ERARecord)
    
    # Use postcode as primary filter if provided (exact match for efficiency)
    if postcode:
        query = query.filter(ERARecord.post_code == postcode)
    elif locality:
        # Fuzzy locality filter - use LIKE for partial match
        query = query.filter(
            ERARecord.locality_name.ilike(f"%{locality[:4]}%")  # First 4 chars
        )
    
    # Surname filter for efficiency - exact match for surname-only searches
    if surname:
        surname_norm = surname.lower().strip()
        if name_only_search:
            # For surname-only, do exact match to get precise results
            query = query.filter(
                ERARecord.surname_normalized == surname_norm
            )
        else:
            # With address info, use prefix for fuzzy matching
            surname_prefix = surname[:3].lower()
            query = query.filter(
                ERARecord.surname_normalized.like(f"{surname_prefix}%")
            )
    
    # Fetch candidates (increase limit for name-only searches)
    candidate_limit = 5000 if name_only_search else 1000
    candidates = query.limit(candidate_limit).all()
    
    # Apply fuzzy matching to candidates
    for era in candidates:
        if name_only_search:
            # For name-only searches, score based on name match only
            surname_score = fuzz.ratio(
                normalize_name(surname),
                normalize_name(era.surname)
            )
            # Use partial_ratio for given names to handle "Ethan" matching "Ethan Christopher"
            given_score = fuzz.partial_ratio(
                normalize_name(given_names or ''),
                normalize_name(era.given_names or '')
            ) if given_names else 50  # Neutral if no given name
            
            name_sc = int(surname_score * 0.6 + given_score * 0.4)
            addr_sc = 0  # No address to match
            overall = name_sc  # Use name score as overall for name-only
            
            # Lower threshold for name-only (exact surname match already)
            effective_threshold = 50
        else:
            overall, name_sc, addr_sc = calculate_match_score(
                surname or '',
                given_names or '',
                locality or '',
                postcode or '',
                era.surname or '',
                era.given_names or '',
                era.locality_name or '',
                era.post_code or ''
            )
            effective_threshold = threshold
        
        if overall >= effective_threshold:
            results.append(ERASearchResult(
                era_record_id=era.id,
                surname=era.surname or '',
                given_names=era.given_names or '',
                full_address=era.full_address or '',
                locality_name=era.locality_name or '',
                post_code=era.post_code or '',
                federal_division=era.federal_division or '',
                state_district=era.state_district or '',
                local_government_area=era.local_government_area or '',
                overall_score=overall,
                name_score=name_sc,
                address_score=addr_sc
            ))
    
    # Deduplicate by name + address (keep highest score)
    seen = {}
    for r in results:
        key = (r.surname.lower(), r.given_names.lower(), r.full_address.lower())
        if key not in seen or r.overall_score > seen[key].overall_score:
            seen[key] = r
    results = list(seen.values())
    
    # Sort by score descending
    results.sort(key=lambda x: x.overall_score, reverse=True)
    return results[:limit]


def match_member_to_era(
    db: Session,
    member: Member,
    threshold: int = MATCH_THRESHOLD
) -> Optional[ERASearchResult]:
    """
    Attempt to match a single member against ERA records.
    
    Returns the best match above threshold, or None.
    """
    results = search_era_records(
        db,
        surname=member.last_name,
        given_names=member.first_name,
        locality=member.primary_city,
        postcode=member.primary_zip,
        limit=1,
        threshold=threshold
    )
    
    return results[0] if results else None


def save_era_match(
    db: Session,
    member_id: int,
    era_result: ERASearchResult
) -> ERAMatch:
    """Save a match result to the database."""
    match = ERAMatch(
        member_id=member_id,
        era_record_id=era_result.era_record_id,
        overall_score=era_result.overall_score,
        name_score=era_result.name_score,
        address_score=era_result.address_score,
        federal_division=era_result.federal_division,
        state_district=era_result.state_district,
        local_government_area=era_result.local_government_area
    )
    db.add(match)
    db.commit()
    db.refresh(match)
    return match


def get_era_stats(db: Session) -> Dict:
    """Get ERA database statistics."""
    total_records = db.query(func.count(ERARecord.id)).scalar() or 0
    total_uploads = db.query(func.count(ERAUpload.id)).scalar() or 0
    
    # Records by state
    by_state = db.query(
        ERARecord.enrolment_state,
        func.count(ERARecord.id)
    ).group_by(ERARecord.enrolment_state).all()
    
    # Top federal divisions
    top_divisions = db.query(
        ERARecord.federal_division,
        func.count(ERARecord.id).label('count')
    ).group_by(ERARecord.federal_division).order_by(
        func.count(ERARecord.id).desc()
    ).limit(10).all()
    
    # Total matches
    total_matches = db.query(func.count(ERAMatch.id)).scalar() or 0
    verified_matches = db.query(func.count(ERAMatch.id)).filter(
        ERAMatch.is_verified == 1
    ).scalar() or 0
    
    return {
        'total_records': total_records,
        'total_uploads': total_uploads,
        'by_state': {s: c for s, c in by_state},
        'top_divisions': [{'division': d, 'count': c} for d, c in top_divisions],
        'total_matches': total_matches,
        'verified_matches': verified_matches
    }


# Directory for ERA file uploads
import os
ERA_UPLOAD_DIR = "era"

def process_era_file(file_path: str, upload_id: int):
    """Background task to parse and store ERA records."""
    from ..database import SessionLocal
    
    db = SessionLocal()
    try:
        upload = db.query(ERAUpload).filter(ERAUpload.id == upload_id).first()
        if not upload:
            logger.error(f"Upload {upload_id} not found")
            return
        
        upload.status = 'parsing'
        db.commit()
        
        logger.info(f"Starting parsing for {file_path}")
        total = 0
        error_count = 0
        
        try:
            # Resume from last known record count
            start_count = upload.record_count
            logger.info(f"Processing ERA file {file_path}, resuming from record {start_count:,}")
            
            for batch in parse_era_file(file_path, skip_rows=start_count):
                count = bulk_insert_era_records(db, upload, batch)
                total += count
                
                # Update progress
                upload.record_count = total
                upload.updated_at = datetime.utcnow()
                db.commit()
            
            # Run verification pass to catch any missing records
            verify_and_repair_era_file(db, file_path, upload)
            
            upload.status = 'complete'
            upload.record_count = total
            db.commit()
            logger.info(f"Completed parsing {file_path}. Total records: {total}")
            
        except Exception as e:
            logger.error(f"Error parsing file: {e}")
            upload.status = 'error'
            upload.error_message = str(e)
            db.commit()
            
    except Exception as e:
        logger.error(f"Process ERA file error: {e}")
    finally:
        db.close()


def verify_and_repair_era_file(db: Session, file_path: str, upload: ERAUpload) -> int:
    """
    Verification pass: Re-scan the file and insert any missing records.
    This catches records that may have been lost due to crashes, duplicate cleanup, etc.
    
    Returns the number of records repaired.
    """
    import csv
    
    logger.info(f"Starting verification pass for {file_path}...")
    
    repaired = 0
    checked = 0
    batch = []
    batch_size = 5000
    
    try:
        with open(file_path, 'r', encoding='utf-8', errors='replace') as f:
            reader = csv.reader(f, delimiter='\t')
            next(reader)  # Skip header
            
            for row in reader:
                checked += 1
                
                try:
                    parsed = parse_era_row(row)
                    
                    # Check if this record exists (by unique constraint fields)
                    exists = db.query(ERARecord.id).filter(
                        ERARecord.surname_normalized == parsed['surname_normalized'],
                        ERARecord.given_names_normalized == parsed['given_names_normalized'],
                        ERARecord.full_address == parsed.get('full_address', '')
                    ).first()
                    
                    if not exists:
                        # Record is missing - add to batch
                        parsed['upload_id'] = upload.id
                        batch.append(parsed)
                        
                    if len(batch) >= batch_size:
                        # Insert missing batch
                        repaired += _insert_missing_records(db, batch)
                        batch = []
                        
                    if checked % 100000 == 0:
                        logger.info(f"Verification: Checked {checked:,} records, repaired {repaired:,}")
                        
                except Exception as e:
                    if checked <= 10:
                        logger.warning(f"Verification error at row {checked}: {e}")
                        
            # Insert remaining batch
            if batch:
                repaired += _insert_missing_records(db, batch)
                
    except Exception as e:
        logger.error(f"Verification pass error: {e}")
        
    if repaired > 0:
        logger.warning(f"Verification complete: Repaired {repaired:,} missing records out of {checked:,} checked")
        # Update record count
        upload.record_count = db.query(ERARecord.id).filter(ERARecord.upload_id == upload.id).count()
        db.commit()
    else:
        logger.info(f"Verification complete: All {checked:,} records present, no repairs needed")
        
    return repaired


def _insert_missing_records(db: Session, records: list) -> int:
    """Insert missing records found during verification."""
    from ..database import is_sqlite
    
    if not records:
        return 0
        
    try:
        if is_sqlite:
            from sqlalchemy import insert
            stmt = insert(ERARecord).values(records).prefix_with("OR IGNORE")
            db.execute(stmt)
        else:
            # PostgreSQL bulk insert with conflict handling
            from sqlalchemy.dialects.postgresql import insert as pg_insert
            stmt = pg_insert(ERARecord).values(records).on_conflict_do_nothing()
            db.execute(stmt)
            
        db.commit()
        return len(records)
        
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to insert missing records: {e}")
        return 0


def sync_era_files(db: Session, background_tasks = None, startup_mode: bool = False):
    """
    Sync /era folder files with database.
    Automatically parses new files and re-parses incomplete ones.
    """
    os.makedirs(ERA_UPLOAD_DIR, exist_ok=True)
    
    # Get all .txt files
    files = [f for f in os.listdir(ERA_UPLOAD_DIR) if f.endswith('.txt')]
    logger.info(f"Checking {len(files)} ERA files on disk for sync...")
    
    for filename in files:
        # Check for duplicates and clean up
        # Prioritize keeping the one with the most progress (record_count)
        uploads = db.query(ERAUpload).filter(ERAUpload.filename == filename).order_by(ERAUpload.record_count.desc(), ERAUpload.id.desc()).all()
        
        if len(uploads) > 1:
            logger.warning(f"Found {len(uploads)} duplicate upload records for {filename}. Cleaning up...")
            # Keep the most progressed one, reassign records from others to survivor
            upload = uploads[0]
            survivor_id = upload.id
            
            for dupe in uploads[1:]:
                logger.info(f"Merging duplicate upload ID {dupe.id} (Status: {dupe.status}) into survivor {survivor_id}")
                
                from sqlalchemy import update, delete
                
                # CRITICAL FIX: Instead of deleting records, reassign them to the survivor
                # This preserves records that were inserted by the first upload before it was interrupted
                records_to_merge = db.query(ERARecord.id).filter(ERARecord.upload_id == dupe.id).count()
                logger.info(f"Reassigning {records_to_merge:,} records from upload {dupe.id} to {survivor_id}")
                
                db.execute(
                    update(ERARecord)
                    .where(ERARecord.upload_id == dupe.id)
                    .values(upload_id=survivor_id)
                )
                
                # Now delete the empty upload record
                db.delete(dupe)
                
            # Update survivor's record count to reflect merged total
            merged_count = db.query(ERARecord.id).filter(ERARecord.upload_id == survivor_id).count()
            upload.record_count = merged_count
            
            db.commit()
            db.refresh(upload)
            logger.info(f"Survivor upload ID {upload.id} now has {upload.record_count:,} records")
            
        elif uploads:
            upload = uploads[0]
        else:
            upload = None
        
        # Determine if we need to parse
        should_parse = False
        
        if not upload:
            logger.info(f"Found new ERA file: {filename}")
            should_parse = True
            # Create new upload record
            new_upload = ERAUpload(
                filename=filename,
                state=filename.split('_')[-1].replace('.txt', '')[:3],
                status='pending'
            )
            db.add(new_upload)
            db.commit()
            db.refresh(new_upload)
            upload_id = new_upload.id

        elif upload.status in ['parsing', 'pending']:
            # Check if it's stale (no updates in 5 minutes)
            # If startup_mode is True, we assume any 'parsing'/'pending' status is a zombie from a previous run.
            five_mins_ago = datetime.utcnow() - timedelta(minutes=5)
            last_update = upload.updated_at or datetime.min
            
            if startup_mode or last_update < five_mins_ago:
                reason = "Server Startup" if startup_mode else f"Stalled (Last update: {last_update})"
                logger.info(f"Found interrupted ERA file: {filename} (Status: {upload.status}, Reason: {reason}). Resuming...")
                upload.status = 'pending'
                db.commit()
                db.refresh(upload)
                upload_id = upload.id
                should_parse = True
            else:
                logger.debug(f"ERA file {filename} is currently {upload.status} (Last update: {last_update}). Skipping.")

        elif upload.status == 'error':
            logger.info(f"Found error ERA file: {filename}. Retrying...")
            # For errors, we might want to clean up if it was a data issue, 
            # but for now let's try resume strategy first too.
            upload.status = 'pending'
            db.commit()
            db.refresh(upload)
            upload_id = upload.id
            should_parse = True
        
        else:
            logger.info(f"ERA file {filename} has unhandled status '{upload.status}'. Ignoring.")
            
        if should_parse:
            logger.info(f"Queueing parse for {filename}")
            file_path = os.path.join(ERA_UPLOAD_DIR, filename)
            
            if background_tasks:
                background_tasks.add_task(process_era_file, file_path, upload_id)
            else:
                # Run in separate thread if no background tasks (e.g. Daemon)
                import threading
                threading.Thread(target=process_era_file, args=(file_path, upload_id)).start()