from sqlalchemy import Column, String, Text, ForeignKey, Boolean
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.models.base import Base, UUIDPrimaryKeyMixin, TimestampMixin


class Category(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "categories"

    organization_id = Column(
        UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False
    )
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    parent_id = Column(
        UUID(as_uuid=True), ForeignKey("categories.id"), nullable=True
    )
    is_active = Column(Boolean, default=True, nullable=False)

    organization = relationship("Organization", back_populates="categories")
    children = relationship("Category", backref="parent", remote_side="Category.id")
    routing_rules = relationship("RoutingRule", back_populates="category")
    priority_rules = relationship("PriorityRule", back_populates="category")
    complaints = relationship("Complaint", back_populates="category")
