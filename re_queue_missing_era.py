from src.api.database import SessionLocal
from src.api.models import Member, CheckResult
from src.api.era_models import ERAMatch
from src.api.services.era import match_member_to_era, save_era_match
from sqlalchemy import or_

MATCH_THRESHOLD = 90

def run_matcher():
    db = SessionLocal()
    
    verified_members = db.query(Member).join(CheckResult).filter(
        or_(CheckResult.result == "Pass", CheckResult.result == "Partial")
    ).all()
    
    matched_count = 0
    checked_count = 0
    
    for member in verified_members:
        # Check if they already have an ERAMatch
        match = db.query(ERAMatch).filter(ERAMatch.member_id == member.id).first()
        if not match:
            checked_count += 1
            print(f"Checking member {member.id} ({member.first_name} {member.last_name})...")
            
            # Try to match them to ERA
            era_result = match_member_to_era(db, member, threshold=MATCH_THRESHOLD)
            
            if era_result and era_result.overall_score >= MATCH_THRESHOLD:
                print(f"  -> Found match with score {era_result.overall_score}!")
                save_era_match(db, member.id, era_result)
                matched_count += 1
            else:
                score = era_result.overall_score if era_result else "None"
                print(f"  -> No match found above threshold (best: {score})")
                
    print(f"\nFinished checking {checked_count} members.")
    print(f"Successfully found and saved {matched_count} new ERAMatch records.")
    
    db.close()

if __name__ == "__main__":
    run_matcher()
