from sqlalchemy import Column, String, Text, ForeignKey, Boolean
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.models.base import Base, UUIDPrimaryKeyMixin, TimestampMixin


class Department(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "departments"

    organization_id = Column(
        UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False
    )
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)

    organization = relationship("Organization", back_populates="departments")
    complaints = relationship("Complaint", back_populates="department")
    routing_rules = relationship("RoutingRule", back_populates="department")
    admin_assignments = relationship("AdminDepartment", back_populates="department")
