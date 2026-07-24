from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

from ..database import get_db
from ..models import User
from ..dependencies import get_current_admin_user

router = APIRouter()

@router.get("", response_model=List[dict])
def read_users(skip: int = 0, limit: int = 100, db: Session = Depends(get_db), current_user: User = Depends(get_current_admin_user)):
    users = db.query(User).offset(skip).limit(limit).all()
    return [{"id": u.id, "email": u.email, "name": u.name, "role": u.role, "is_active": u.is_active} for u in users]

@router.post("", status_code=201)
def create_user(user_data: dict, db: Session = Depends(get_db), current_user: User = Depends(get_current_admin_user)):
    email = user_data.get("email")
    if not email:
        raise HTTPException(status_code=400, detail="Email is required")
    
    email = email.lower().strip()
    
    existing_user = db.query(User).filter(User.email == email).first()
    if existing_user:
        raise HTTPException(status_code=400, detail="User with this email already exists")
    
    new_user = User(
        email=email,
        name=user_data.get("name"),
        role=user_data.get("role", "user"),
        is_active=user_data.get("is_active", True),
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return {"message": "User created successfully", "id": new_user.id}

@router.put("/{user_id}")
def update_user(user_id: int, user_update: dict, db: Session = Depends(get_db), current_user: User = Depends(get_current_admin_user)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    if "role" in user_update:
        user.role = user_update["role"]
    if "is_active" in user_update:
        user.is_active = user_update["is_active"]
        
    db.commit()
    return {"message": "User updated"}
