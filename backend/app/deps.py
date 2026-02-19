from typing import Optional
from uuid import UUID

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from app.auth import decode_access_token
from app.database import get_db
from app.models import User

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")


def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> User:
    credentials_exc = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    payload = decode_access_token(token)
    if payload is None:
        raise credentials_exc
    user_id: Optional[str] = payload.get("sub")
    if user_id is None:
        raise credentials_exc
    user = db.query(User).filter(User.id == UUID(user_id)).first()
    if user is None:
        raise credentials_exc
    return user


def require_roles(*roles: str):
    """Dependency factory: enforce that current user has one of the given roles."""
    def _check(current_user: User = Depends(get_current_user)) -> User:
        if current_user.role not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient permissions",
            )
        return current_user
    return _check


def require_district_scope(
    request_district_id: UUID,
    current_user: User,
) -> None:
    """Raise 403 if user is district_admin and the request is outside their district."""
    if current_user.role == "district_admin":
        if str(current_user.district_id) != str(request_district_id):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access to this district is not allowed",
            )


def require_municipality_scope(
    request_municipality_id: UUID,
    current_user: User,
) -> None:
    """Raise 403 if user doesn't belong to the request's municipality."""
    if str(current_user.municipality_id) != str(request_municipality_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access to this municipality is not allowed",
        )
