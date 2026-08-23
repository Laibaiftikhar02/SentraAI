from sqlalchemy import Column, String, Text, ForeignKey, Boolean, JSON
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.models.base import Base, UUIDPrimaryKeyMixin, TimestampMixin


class RoutingRule(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    """Maps configured categories/context to a department queue."""
    __tablename__ = "routing_rules"

    organization_id = Column(
        UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False
    )
    category_id = Column(
        UUID(as_uuid=True), ForeignKey("categories.id"), nullable=True
    )
    department_id = Column(
        UUID(as_uuid=True), ForeignKey("departments.id"), nullable=False
    )
    conditions_json = Column(JSON, nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    created_by = Column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )

    organization = relationship("Organization", back_populates="routing_rules")
    category = relationship("Category", back_populates="routing_rules")
    department = relationship("Department", back_populates="routing_rules")
