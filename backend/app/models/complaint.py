from sqlalchemy import Column, String, Text, ForeignKey, CheckConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.models.base import Base, UUIDPrimaryKeyMixin, TimestampMixin


class Complaint(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "complaints"

    __table_args__ = (
        CheckConstraint(
            "status IN ('created','assigned','in_progress','resolved','closed','reopened')",
            name="ck_complaints_status",
        ),
        CheckConstraint(
            "priority IN ('critical','high','medium','low')",
            name="ck_complaints_priority",
        ),
    )

    organization_id = Column(
        UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False
    )
    user_id = Column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    department_id = Column(
        UUID(as_uuid=True), ForeignKey("departments.id"), nullable=True
    )  # null = General Review / Unassigned
    zone_id = Column(
        UUID(as_uuid=True), ForeignKey("campus_zones.id"), nullable=True
    )
    duplicate_cluster_id = Column(
        UUID(as_uuid=True), ForeignKey("duplicate_clusters.id"), nullable=True
    )
    title = Column(String(500), nullable=False)
    description = Column(Text, nullable=False)
    status = Column(String(20), nullable=False, default="created")
    priority = Column(String(20), nullable=True)  # set by admin after AI review
    ai_status = Column(
        String(20), nullable=True
    )  # 'pending' | 'completed' | 'unavailable' | 'timeout' | 'invalid'

    organization = relationship("Organization", back_populates="complaints")
    user = relationship("User", back_populates="complaints")
    department = relationship("Department", back_populates="complaints")
    zone = relationship("CampusZone", back_populates="complaints")
    duplicate_cluster = relationship("DuplicateCluster", back_populates="complaints")
    history = relationship(
        "ComplaintHistory", back_populates="complaint", order_by="ComplaintHistory.created_at"
    )
    attachments = relationship("Attachment", back_populates="complaint")
    ai_prediction = relationship(
        "AIPrediction", back_populates="complaint", uselist=False
    )
