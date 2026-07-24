from src.api.database import SessionLocal
from src.api.models import Member, CheckResult
from src.api.era_models import ERAMatch, ERARecord
from sqlalchemy import or_

def analyze():
    db = SessionLocal()
    
    verified_members = db.query(Member).join(CheckResult).filter(
        or_(CheckResult.result == "Pass", CheckResult.result == "Partial")
    ).all()
    
    missing_matches = []
    
    for member in verified_members:
        match = db.query(ERAMatch).filter(ERAMatch.member_id == member.id).first()
        if not match:
            # Let's see how this member was verified
            last_check = member.check_results[-1]
            missing_matches.append(last_check.verification_method)
            
    print(f"Of the {len(missing_matches)} verified members missing an ERAMatch:")
    print(f"- Verified via browser: {missing_matches.count('browser')}")
    print(f"- Verified via era: {missing_matches.count('era')}")
    print(f"- Verified via other: {len(missing_matches) - missing_matches.count('browser') - missing_matches.count('era')}")
    
    db.close()

if __name__ == "__main__":
    analyze()
