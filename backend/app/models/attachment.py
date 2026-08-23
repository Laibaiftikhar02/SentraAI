from sqlalchemy import Column, String, Integer, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.models.base import Base, UUIDPrimaryKeyMixin, TimestampMixin


class Attachment(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    """File metadata. Actual file content stored in local storage (MVP)."""
    __tablename__ = "attachments"

    complaint_id = Column(
        UUID(as_uuid=True), ForeignKey("complaints.id"), nullable=False
    )
    original_filename = Column(String(500), nullable=False)
    stored_filename = Column(String(500), nullable=False)
    file_type = Column(String(100), nullable=False)
    file_size = Column(Integer, nullable=False)
    uploader_id = Column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )

    complaint = relationship("Complaint", back_populates="attachments")
