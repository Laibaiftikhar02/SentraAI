from sqlalchemy import Column, String, ForeignKey, Integer, JSON
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.models.base import Base, UUIDPrimaryKeyMixin, TimestampMixin


class PriorityRule(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    """Organization-specific urgency/priority policy."""
    __tablename__ = "priority_rules"

    organization_id = Column(
        UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False
    )
    category_id = Column(
        UUID(as_uuid=True), ForeignKey("categories.id"), nullable=True
    )
    priority_level = Column(
        String(20), nullable=False
    )  # 'critical' | 'high' | 'medium' | 'low'
    weight = Column(Integer, default=0)
    conditions_json = Column(JSON, nullable=True)

    organization = relationship("Organization", back_populates="priority_rules")
    category = relationship("Category", back_populates="priority_rules")
