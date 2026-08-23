from sqlalchemy import Column, String, Text, Float, Boolean, ForeignKey, JSON
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.models.base import Base, UUIDPrimaryKeyMixin, TimestampMixin


class AIPrediction(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    """AI-generated recommendations. Stored SEPARATELY from complaint data."""
    __tablename__ = "ai_predictions"

    complaint_id = Column(
        UUID(as_uuid=True), ForeignKey("complaints.id"), nullable=False, unique=True
    )
    summary = Column(Text, nullable=True)
    category = Column(String(255), nullable=True)
    category_confidence = Column(Float, nullable=True)
    priority = Column(String(20), nullable=True)
    priority_confidence = Column(Float, nullable=True)
    priority_rationale = Column(Text, nullable=True)
    department = Column(String(255), nullable=True)
    routing_confidence = Column(Float, nullable=True)
    duplicate_detected = Column(Boolean, default=False)
    duplicate_cluster_id = Column(
        UUID(as_uuid=True), ForeignKey("duplicate_clusters.id"), nullable=True
    )
    needs_manual_review = Column(Boolean, default=False)
    explanation_json = Column(JSON, nullable=True)
    model_name = Column(String(100), nullable=True)
    provider = Column(String(100), nullable=True)

    complaint = relationship("Complaint", back_populates="ai_prediction")
