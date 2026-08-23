from sqlalchemy import Column, String, Text, ForeignKey, UUID as SQLUUID
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.models.base import Base, UUIDPrimaryKeyMixin, TimestampMixin


class AdminDepartment(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    """Join table linking Department Admins to their assigned departments."""
    __tablename__ = "admin_departments"

    user_id = Column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    department_id = Column(
        UUID(as_uuid=True), ForeignKey("departments.id"), nullable=False
    )

    user = relationship("User", back_populates="admin_departments")
    department = relationship("Department", back_populates="admin_assignments")
