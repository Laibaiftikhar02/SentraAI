"""Import all models so Alembic and the app can discover them."""

from app.models.base import Base
from app.models.organization import Organization
from app.models.department import Department
from app.models.category import Category
from app.models.user import User
from app.models.admin_department import AdminDepartment
from app.models.complaint import Complaint
from app.models.complaint_history import ComplaintHistory
from app.models.duplicate_cluster import DuplicateCluster
from app.models.ai_prediction import AIPrediction
from app.models.campus_zone import CampusZone
from app.models.attachment import Attachment
from app.models.notification import Notification
from app.models.audit_log import AuditLog
from app.models.routing_rule import RoutingRule
from app.models.priority_rule import PriorityRule

__all__ = [
    "Base",
    "Organization",
    "Department",
    "Category",
    "User",
    "AdminDepartment",
    "Complaint",
    "ComplaintHistory",
    "DuplicateCluster",
    "AIPrediction",
    "CampusZone",
    "Attachment",
    "Notification",
    "AuditLog",
    "RoutingRule",
    "PriorityRule",
]
