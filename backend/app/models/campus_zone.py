from datetime import datetime, timezone

from sqlalchemy import Column, String, Text, ForeignKey, JSON, DateTime, Boolean
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.models.base import Base, UUIDPrimaryKeyMixin, TimestampMixin


class CampusZone(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    """Configured campus/building zone for heatmap visualization."""
    __tablename__ = "campus_zones"

    organization_id = Column(
        UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False
    )
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    polygon_json = Column(JSON, nullable=True)  # SVG path / coordinate array
    zone_type = Column(
        String(50), nullable=True
    )  # 'building' | 'hostel' | 'academic' | 'outdoor' | etc.
    is_active = Column(Boolean, default=True, nullable=False)

    organization = relationship("Organization", back_populates="campus_zones")
    complaints = relationship("Complaint", back_populates="zone")
