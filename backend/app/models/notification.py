from sqlalchemy import Column, String, Text, Boolean, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.models.base import Base, UUIDPrimaryKeyMixin, TimestampMixin


class Notification(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    """In-app notification. Failure must never block complaint processing."""
    __tablename__ = "notifications"

    user_id = Column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    type = Column(String(50), nullable=False)
    message = Column(Text, nullable=False)
    is_read = Column(Boolean, default=False, nullable=False)
    complaint_id = Column(
        UUID(as_uuid=True), ForeignKey("complaints.id"), nullable=True
    )

    user = relationship("User", back_populates="notifications")
