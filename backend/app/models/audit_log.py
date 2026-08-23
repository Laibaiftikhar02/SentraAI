from datetime import datetime, timezone

from sqlalchemy import Column, String, Text, ForeignKey, JSON, DateTime, UUID as SA_UUID
from sqlalchemy.dialects.postgresql import UUID

from app.models.base import Base, UUIDPrimaryKeyMixin


class AuditLog(Base, UUIDPrimaryKeyMixin):
    """Security/administrative audit trail. Append-only."""
    __tablename__ = "audit_logs"

    organization_id = Column(
        UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=True
    )
    actor_id = Column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )
    action = Column(String(100), nullable=False)
    target_type = Column(String(100), nullable=True)
    target_id = Column(String(255), nullable=True)
    metadata_json = Column(JSON, nullable=True)
    created_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
