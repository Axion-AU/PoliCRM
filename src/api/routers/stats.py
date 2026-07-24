from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session, aliased
from sqlalchemy import func
from datetime import datetime, timedelta

from ..database import get_db
from ..models import Member, CheckResult, User
from ..dependencies import get_current_active_user

router = APIRouter()

@router.get("/dashboard")
def get_dashboard_stats(db: Session = Depends(get_db), current_user: User = Depends(get_current_active_user)):
    total_members = db.query(Member).count()
    active_members = db.query(Member).filter(Member.membership_status == "active").count()
    lapsed_members = db.query(Member).filter(Member.membership_status == "lapsed").count()
    
    # Use subquery to get the LATEST check result for each member
    # MAX(id) is a good proxy for "latest" if ids are sequential
    latest_checks_subquery = db.query(
        CheckResult.member_id,
        func.max(CheckResult.id).label("max_id")
    ).group_by(CheckResult.member_id).subquery()
    
    LatestCheckResult = aliased(CheckResult)
    
    # Common join structure: Member -> Subquery -> LatestCheckResult
    # We query Member to ensure we only count active/existing members
    # and to align with the /members list view.
    
    def get_count_by_status(status_filter):
        q = db.query(Member)
        q = q.join(latest_checks_subquery, Member.id == latest_checks_subquery.c.member_id)
        q = q.join(LatestCheckResult, LatestCheckResult.id == latest_checks_subquery.c.max_id)
        return q.filter(status_filter).count()

    verified = get_count_by_status(LatestCheckResult.result == "Pass")
    
    failed = get_count_by_status(
        LatestCheckResult.result.in_(["Fail", "Fail_Suburb", "Fail_Street", "Fail_No_Match"])
    )
    
    partial = get_count_by_status(LatestCheckResult.result == "Partial")
    
    captcha = get_count_by_status(LatestCheckResult.result == "Captcha")
    
    unchecked = total_members - (verified + failed + partial + captcha)
    # Ensure unchecked is not negative due to any sync delays
    unchecked = max(0, unchecked)
    
    duplicate = db.query(Member).filter(Member.is_duplicate == True).count()
    
    state_distribution = db.query(Member.primary_state, func.count(Member.id)).group_by(Member.primary_state).all()
    
    thirty_days_ago = datetime.utcnow() - timedelta(days=30)
    new_members = db.query(Member).filter(Member.created_at >= thirty_days_ago).count()
    
    return {
        "total_members": total_members,
        "active_members": active_members,
        "lapsed_members": lapsed_members,
        "verified_count": verified,
        "failed_count": failed,
        "partial_match_count": partial,
        "captcha_count": captcha,
        "unchecked_count": unchecked,
        "duplicate_count": duplicate,
        "new_members_30d": new_members,
        "by_state": dict(state_distribution)
    }

@router.get("/electorates")
def get_electorate_stats(db: Session = Depends(get_db), current_user: User = Depends(get_current_active_user)):
    federal_dist = db.query(CheckResult.federal_division, func.count(func.distinct(CheckResult.member_id)))\
        .filter(CheckResult.federal_division.isnot(None))\
        .group_by(CheckResult.federal_division)\
        .order_by(func.count(func.distinct(CheckResult.member_id)).desc()).all()
    
    return [{"federal_division": d, "count": c} for d, c in federal_dist]

@router.get("/activity")
def get_recent_activity(limit: int = 10, db: Session = Depends(get_db), current_user: User = Depends(get_current_active_user)):
    """Get recent check results as activity feed."""
    recent_checks = db.query(CheckResult)\
        .join(Member)\
        .order_by(CheckResult.timestamp.desc())\
        .limit(limit)\
        .all()
    
    activities = []
    for check in recent_checks:
        member = check.member
        activities.append({
            "id": check.id,
            "type": "check",
            "result": check.result,
            "member_id": member.id,
            "member_name": f"{member.first_name} {member.last_name}",
            "federal_division": check.federal_division,
            "timestamp": check.timestamp.isoformat() if check.timestamp else None,
        })
    
    return activities

