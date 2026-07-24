from fastapi import Depends, HTTPException, status, Request
from sqlalchemy.orm import Session
from dotenv import load_dotenv
import logging

from .database import get_db
from .models import User

load_dotenv()

logger = logging.getLogger(__name__)


def get_user_from_headers(request: Request, db: Session = Depends(get_db)):
    """
    Extract user from X-User-* headers set by the auth-worker reverse proxy.
    If the headers are absent, the request is unauthorized.
    If the user doesn't exist in local DB, they are created on the fly.
    """
    user_id = request.headers.get("X-User-Id")
    user_email = request.headers.get("X-User-Email")
    user_role = request.headers.get("X-User-Role")

    if not user_id or not user_email:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing authentication headers. Request must go through auth gateway.",
        )

    email = user_email.lower().strip()
    user = db.query(User).filter(User.email == email).first()

    if not user:
        logger.info(f"Auto-creating local user for {email}")
        user = User(
            email=email,
            role=user_role or "user",
            is_active=True,
        )
        db.add(user)
        db.commit()
        db.refresh(user)

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is inactive.",
        )

    return user


def get_current_active_user(current_user: User = Depends(get_user_from_headers)):
    if not current_user.is_active:
        raise HTTPException(status_code=400, detail="Inactive user")
    return current_user


def get_current_admin_user(current_user: User = Depends(get_current_active_user)):
    if current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not enough permissions",
        )
    return current_user
