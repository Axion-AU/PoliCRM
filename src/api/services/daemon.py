import threading
import time
import os
import logging
from datetime import datetime, timedelta
from sqlalchemy import func
from sqlalchemy.orm import aliased
from ..database import SessionLocal
from ..models import Member, CheckResult
from ..era_models import ERAUpload, ERAMatch
from ..dependencies import browser_pool
from .era import sync_era_files, verify_and_repair_era_file, ERA_UPLOAD_DIR

logger = logging.getLogger(__name__)

auto_check_daemon_running = False
auto_check_thread = None

# Track last verification time (persists across daemon iterations)
_last_era_verification = None

def auto_check_daemon():
    """Background daemon that automatically queues unchecked, failed, and captcha members."""
    global auto_check_daemon_running, _last_era_verification
    logger.info("Auto-check daemon started")
    
    retry_interval_minutes = 60
    verification_interval_hours = 24  # Run ERA verification every 24 hours
    last_retry_check = time.time()
    
    first_run = True
    
    while auto_check_daemon_running:
        try:
            db = SessionLocal()
            current_time = time.time()
            
            # 0. Sync ERA files (Auto-parsing)
            try:
                # Daemon thread spawns parsing threads if needed
                # On first run, force resume of any 'parsing' files (zombies from restart)
                sync_era_files(db, background_tasks=None, startup_mode=first_run)
                first_run = False
            except Exception as e:
                logger.error(f"ERA sync error: {e}")
            
            # 0.5 Periodic ERA Verification (self-healing check every 24 hours)
            try:
                now = datetime.utcnow()
                should_verify = (
                    _last_era_verification is None or 
                    (now - _last_era_verification) > timedelta(hours=verification_interval_hours)
                )
                
                if should_verify:
                    # Only verify 'complete' uploads to avoid interfering with active parsing
                    complete_uploads = db.query(ERAUpload).filter(ERAUpload.status == 'complete').all()
                    
                    if complete_uploads:
                        logger.info(f"Periodic ERA verification: Checking {len(complete_uploads)} complete uploads...")
                        
                        for upload in complete_uploads:
                            file_path = os.path.join(ERA_UPLOAD_DIR, upload.filename)
                            if os.path.exists(file_path):
                                repaired = verify_and_repair_era_file(db, file_path, upload)
                                if repaired > 0:
                                    logger.warning(f"Periodic verification repaired {repaired} records for {upload.filename}")
                        
                        _last_era_verification = now
                        logger.info("Periodic ERA verification complete")
                    else:
                        # No complete uploads, but still mark as checked
                        _last_era_verification = now
                        
            except Exception as e:
                logger.error(f"Periodic ERA verification error: {e}")
            
            # 1. Find all members that have never been checked
            # Use explicit select() to avoid SAWarning about coercing subquery
            stmt = db.query(CheckResult.member_id).distinct()
            unchecked_members = db.query(Member).filter(
                ~Member.id.in_(stmt)
            ).all()
            
            if unchecked_members:
                logger.info(f"Auto-check daemon found {len(unchecked_members)} unchecked members")
                for member in unchecked_members:
                    try:
                        browser_pool.enqueue_check(member.id)
                        logger.debug(f"Auto-queued unchecked member {member.id}")
                    except Exception as e:
                        logger.error(f"Failed to auto-queue member {member.id}: {e}")
            
            # 2. Continuously retry failed, partial, and captcha members
            # We rely on browser_pool.queued_items to prevent duplicate queuing
            logger.debug("Auto-check daemon checking for failed/partial/captcha members to retry")
            
            # Subquery to get the latest check result for each member (using MAX(id) for consistency)
            latest_checks_subquery = db.query(
                CheckResult.member_id,
                func.max(CheckResult.id).label("max_id")
            ).group_by(CheckResult.member_id).subquery()
            
            LatestCheckResult = aliased(CheckResult)
            
            # Retry only if the result is older than 60 minutes to prevent infinite loops
            retry_threshold = datetime.utcnow() - timedelta(minutes=retry_interval_minutes)
            
            # Get members whose latest check was Captcha, Fail, or missing ERA match despite being verified
            retry_results = db.query(LatestCheckResult).join(
                latest_checks_subquery,
                LatestCheckResult.id == latest_checks_subquery.c.max_id
            ).filter(
                (LatestCheckResult.timestamp < retry_threshold) &
                (
                    (LatestCheckResult.result.in_(['Captcha', 'Fail', 'Fail_Suburb', 'Fail_Street', 'Fail_No_Match'])) |
                    (LatestCheckResult.result.in_(['Pass', 'Partial']) & ~db.query(ERAMatch).filter(ERAMatch.member_id == LatestCheckResult.member_id).exists())
                )
            ).all()
            
            if retry_results:
                logger.info(f"Auto-check daemon found {len(retry_results)} members to retry")
                for result in retry_results:
                    try:
                        member = db.query(Member).filter(Member.id == result.member_id).first()
                        if member:
                            browser_pool.enqueue_check(member.id)
                    except Exception as e:
                        logger.error(f"Failed to auto-queue retry for member {result.member_id}: {e}")
            
            db.close()
            time.sleep(30)
            
        except Exception as e:
            logger.error(f"Auto-check daemon error: {e}")
            time.sleep(60)
    
    logger.info("Auto-check daemon stopped")

def start_daemon():
    global auto_check_daemon_running, auto_check_thread
    if not auto_check_daemon_running:
        auto_check_daemon_running = True
        auto_check_thread = threading.Thread(target=auto_check_daemon, daemon=True)
        auto_check_thread.start()
        logger.info("Auto-check daemon thread started")

def stop_daemon():
    global auto_check_daemon_running
    auto_check_daemon_running = False
    if auto_check_thread:
        auto_check_thread.join(timeout=5)
