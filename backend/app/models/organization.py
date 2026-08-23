from sqlalchemy import Column, String, Text
from sqlalchemy.orm import relationship

from app.models.base import Base, UUIDPrimaryKeyMixin, TimestampMixin


class Organization(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "organizations"

    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    settings_json = Column(Text, nullable=True)  # JSON config blob

    departments = relationship("Department", back_populates="organization")
    users = relationship("User", back_populates="organization")
    categories = relationship("Category", back_populates="organization")
    complaints = relationship("Complaint", back_populates="organization")
    campus_zones = relationship("CampusZone", back_populates="organization")
    routing_rules = relationship("RoutingRule", back_populates="organization")
    priority_rules = relationship("PriorityRule", back_populates="organization")
    duplicate_clusters = relationship("DuplicateCluster", back_populates="organization")
