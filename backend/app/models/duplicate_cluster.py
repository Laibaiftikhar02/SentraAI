from sqlalchemy import Column, String, Text, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.models.base import Base, UUIDPrimaryKeyMixin, TimestampMixin


class DuplicateCluster(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    """Groups similar complaints. Original complaints are NEVER deleted."""
    __tablename__ = "duplicate_clusters"

    organization_id = Column(
        UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False
    )
    summary = Column(Text, nullable=True)

    organization = relationship("Organization", back_populates="duplicate_clusters")
    complaints = relationship("Complaint", back_populates="duplicate_cluster")
