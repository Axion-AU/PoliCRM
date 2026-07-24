# Backend Architecture

## Overview

The PoliCRM backend is a Python application built with:

- **FastAPI** - Modern async web framework
- **SQLAlchemy** - ORM with PostgreSQL
- **Firebase Admin** - Authentication verification
- **Selenium** - AEC verification automation

## Directory Structure

```
src/
├── api/
│   ├── main.py          # FastAPI application
│   ├── routers/
│   │   ├── members.py   # Member endpoints
│   │   ├── tags.py      # Tag endpoints
│   │   ├── stats.py     # Statistics
│   │   ├── era.py       # Electoral roll access
│   │   └── db.py        # Database viewer
│   ├── services/
│   │   ├── members.py   # Business logic
│   │   ├── era.py       # ERA search/matching
│   │   └── aec.py       # AEC verification
│   ├── models/
│   │   └── database.py  # SQLAlchemy models
│   └── static/
│       └── dist/        # Frontend build output
└── aec_worker/
    ├── worker.py        # Background worker
    └── queue.py         # Job queue
```

## Authentication

Firebase JWT verification middleware:

```python
from src.api.auth import get_current_user

@router.get("/members")
async def get_members(user = Depends(get_current_user)):
    # user is the decoded Firebase token
    ...
```

## Database Models

```python
class Member(Base):
    __tablename__ = "members"

    id = Column(Integer, primary_key=True)
    first_name = Column(String)
    last_name = Column(String)
    email = Column(String, unique=True)
    primary_state = Column(String)
    check_results = relationship("CheckResult")
    tags = relationship("Tag", secondary=member_tags)
```

## API Pattern

```python
@router.get("/members")
async def list_members(
    search: str = None,
    status: List[str] = Query(None),
    skip: int = 0,
    limit: int = 50,
    db: Session = Depends(get_db),
    user = Depends(get_current_user),
):
    query = db.query(Member)

    if search:
        query = query.filter(
            Member.first_name.ilike(f"%{search}%") |
            Member.last_name.ilike(f"%{search}%")
        )

    total = query.count()
    members = query.offset(skip).limit(limit).all()

    return {"members": members, "total": total}
```

## Background Workers

AEC verification runs in background workers:

```python
# Queue a verification job
queue.enqueue({
    "type": "aec_check",
    "member_id": 123
})

# Worker processes jobs
while True:
    job = queue.dequeue()
    if job["type"] == "aec_check":
        run_aec_verification(job["member_id"])
```

## ERA (Electoral Roll) Integration

Fuzzy matching with RapidFuzz:

```python
from rapidfuzz import fuzz

def match_member_to_era(member, era_records, threshold=80):
    candidates = []
    for record in era_records:
        score = fuzz.ratio(
            f"{member.first_name} {member.last_name}",
            f"{record.given_names} {record.surname}"
        )
        if score >= threshold:
            candidates.append((record, score))
    return sorted(candidates, key=lambda x: -x[1])
```

## Running the Server

```bash
uvicorn src.api.main:app --reload --port 8000
```

## Environment Variables

See [Configuration Guide](../getting-started/configuration.md)
