from datetime import datetime, timezone

from sqlalchemy import Column, String, Text, ForeignKey, JSON, DateTime
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.models.base import Base, UUIDPrimaryKeyMixin


class ComplaintHistory(Base, UUIDPrimaryKeyMixin):
    """Append-only timeline of complaint changes. Never UPDATE or DELETE rows."""
    __tablename__ = "complaint_history"

    complaint_id = Column(
        UUID(as_uuid=True), ForeignKey("complaints.id"), nullable=False
    )
    action = Column(String(100), nullable=False)
    previous_value = Column(Text, nullable=True)
    new_value = Column(Text, nullable=True)
    actor_id = Column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )
    metadata_json = Column(JSON, nullable=True)
    created_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    complaint = relationship("Complaint", back_populates="history")
