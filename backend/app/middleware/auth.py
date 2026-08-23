"""JWT authentication middleware and RBAC helpers."""

from uuid import UUID

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User
from app.services.auth_service import decode_access_token

security = HTTPBearer()


class CurrentUser:
    """Parsed identity from a validated JWT."""

    def __init__(self, user_id: UUID, role: str, organization_id: UUID):
        self.user_id = user_id
        self.role = role
        self.organization_id = organization_id


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> CurrentUser:
    """Extract and validate JWT, return CurrentUser or 401."""
    payload = decode_access_token(credentials.credentials)
    if payload is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )
    return CurrentUser(
        user_id=UUID(payload["sub"]),
        role=payload["role"],
        organization_id=UUID(payload["org"]),
    )


def require_role(*allowed_roles: str):
    """Dependency factory: raises 403 if user's role is not in allowed_roles."""

    def _check(current_user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
        if current_user.role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient permissions",
            )
        return current_user

    return _check


def get_current_user_model(
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> User:
    """Load the full User model for the authenticated user."""
    user = db.query(User).filter(User.id == current_user.user_id).first()
    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or inactive",
        )
    return user
