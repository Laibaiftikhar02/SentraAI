"""Admin complaint management — business logic.

Handles: accept/modify AI suggestions, reassign, status transitions,
internal notes, responses, resolution, notifications, and audit logging.

Key rules (PMD v2.2 / AI Contract):
- AI recommends. Human Admin verifies and decides.
- AI never automatically resolves or closes a complaint.
- Every admin action creates a ComplaintHistory + AuditLog entry.
- Department Admins operate within their authorized department scope.
- Report count does NOT change urgency.
"""

from __future__ import annotations

from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy.orm import Session, joinedload

from app.middleware.auth import CurrentUser
from app.models.admin_department import AdminDepartment
from app.models.audit_log import AuditLog
from app.models.category import Category
from app.models.complaint import Complaint
from app.models.complaint_history import ComplaintHistory
from app.models.department import Department
from app.models.duplicate_cluster import DuplicateCluster
from app.models.notification import Notification
from app.models.user import User
from app.schemas.admin import AdminUpdateComplaint


# ── Valid state transitions ────────────────────────────────────────────────────

_VALID_TRANSITIONS: dict[str, set[str]] = {
    "created":   {"assigned", "in_progress"},
    "assigned":  {"in_progress", "resolved"},
    "in_progress": {"resolved", "reopened"},
    "resolved":  {"closed", "reopened"},
    "closed":    {"reopened"},
    "reopened":  {"in_progress", "assigned"},
}


# ── Authorization ─────────────────────────────────────────────────────────────

def _get_admin_department_ids(db: Session, user_id: UUID) -> list[UUID]:
    rows = (
        db.query(AdminDepartment.department_id)
        .filter(AdminDepartment.user_id == user_id)
        .all()
    )
    return [r[0] for r in rows]


def _authorize_admin_complaint(
    db: Session, current_user: CurrentUser, complaint: Complaint
) -> None:
    """Raise 403 if the admin cannot manage this complaint."""
    if current_user.role == "super_admin":
        if complaint.organization_id != current_user.organization_id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Complaint not found.",
            )
        return

    if current_user.role == "admin":
        dept_ids = _get_admin_department_ids(db, current_user.user_id)
        # Admin can access if complaint is in their department
        # OR if complaint has no department (General Review) — admins can pick up
        if complaint.department_id is not None and complaint.department_id not in dept_ids:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have access to this complaint.",
            )
        return

    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Insufficient permissions.",
    )


# ── Load complaint for admin ──────────────────────────────────────────────────

def get_admin_complaint(
    db: Session, complaint_id: UUID, current_user: CurrentUser
) -> Complaint:
    """Load a complaint with full detail for admin view."""
    complaint = (
        db.query(Complaint)
        .options(
            joinedload(Complaint.department),
            joinedload(Complaint.zone),
            joinedload(Complaint.category),
            joinedload(Complaint.user),
            joinedload(Complaint.attachments),
            joinedload(Complaint.ai_prediction),
            joinedload(Complaint.duplicate_cluster),
        )
        .filter(Complaint.id == complaint_id)
        .first()
    )
    if not complaint:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Complaint not found.",
        )
    _authorize_admin_complaint(db, current_user, complaint)
    return complaint


# ── Admin update complaint ────────────────────────────────────────────────────

def admin_update_complaint(
    db: Session,
    complaint_id: UUID,
    current_user: CurrentUser,
    update: AdminUpdateComplaint,
) -> Complaint:
    """Apply admin changes to a complaint with history and audit logging."""
    complaint = get_admin_complaint(db, complaint_id, current_user)
    changes: list[str] = []

    # ── Category override ──
    if update.category_id is not None:
        cat = (
            db.query(Category)
            .filter(
                Category.id == update.category_id,
                Category.organization_id == complaint.organization_id,
                Category.is_active.is_(True),
            )
            .first()
        )
        if not cat:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Invalid or inactive category.",
            )
        old = str(complaint.category_id) if complaint.category_id else None
        complaint.category_id = cat.id
        changes.append("category")
        _add_history(db, complaint.id, "category_changed",
                     old, cat.name, current_user.user_id)

    # ── Priority override ──
    if update.priority is not None:
        old = complaint.priority
        complaint.priority = update.priority
        changes.append("priority")
        _add_history(db, complaint.id, "priority_changed",
                     old, update.priority, current_user.user_id)

    # ── Department reassignment ──
    if update.department_id is not None:
        dept = (
            db.query(Department)
            .filter(
                Department.id == update.department_id,
                Department.organization_id == complaint.organization_id,
                Department.is_active.is_(True),
            )
            .first()
        )
        if not dept:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Invalid or inactive department.",
            )
        old = complaint.department.name if complaint.department else None
        complaint.department_id = dept.id
        changes.append("department")
        _add_history(db, complaint.id, "department_changed",
                     old, dept.name, current_user.user_id)

    # ── Reassign to another admin ──
    if update.assign_to_user_id is not None:
        target = (
            db.query(User)
            .filter(
                User.id == update.assign_to_user_id,
                User.role == "admin",
                User.is_active.is_(True),
                User.organization_id == complaint.organization_id,
            )
            .first()
        )
        if not target:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Invalid admin user for reassignment.",
            )
        _add_history(db, complaint.id, "reassigned",
                     None, target.name, current_user.user_id,
                     {"target_user_id": str(target.id)})
        # Create notification for the assigned admin
        _create_notification(
            db, target.id, "assignment",
            f"You have been assigned complaint: {complaint.title}",
            complaint.id,
        )
        changes.append("assignment")

    # ── Status transition ──
    if update.status is not None:
        _validate_transition(complaint.status, update.status)
        old = complaint.status
        complaint.status = update.status
        changes.append("status")
        _add_history(db, complaint.id, "status_changed",
                     old, update.status, current_user.user_id)

        # Notify submitter on key transitions
        if update.status in ("resolved", "closed"):
            _create_notification(
                db, complaint.user_id, "status_change",
                f"Your complaint '{complaint.title}' has been {update.status}.",
                complaint.id,
            )

    # ── Internal note ──
    if update.note:
        _add_history(db, complaint.id, "admin_note",
                     None, update.note, current_user.user_id)
        changes.append("note")

    # ── Response to submitter ──
    if update.response:
        _add_history(db, complaint.id, "admin_response",
                     None, update.response, current_user.user_id)
        _create_notification(
            db, complaint.user_id, "admin_response",
            f"Admin responded to your complaint: {complaint.title}",
            complaint.id,
        )
        changes.append("response")

    # ── Audit log ──
    if changes:
        _add_audit_log(db, current_user, complaint, changes, update)

    db.commit()
    db.refresh(complaint)
    return complaint


def _validate_transition(current: str, target: str) -> None:
    allowed = _VALID_TRANSITIONS.get(current, set())
    if target not in allowed:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Cannot transition from '{current}' to '{target}'.",
        )


# ── History helper ────────────────────────────────────────────────────────────

def _add_history(
    db: Session,
    complaint_id: UUID,
    action: str,
    previous: str | None,
    new_value: str | None,
    actor_id: UUID,
    metadata_json: dict | None = None,
) -> None:
    entry = ComplaintHistory(
        complaint_id=complaint_id,
        action=action,
        previous_value=previous,
        new_value=new_value,
        actor_id=actor_id,
        metadata_json=metadata_json,
    )
    db.add(entry)


# ── Audit log helper ──────────────────────────────────────────────────────────

def _add_audit_log(
    db: Session,
    current_user: CurrentUser,
    complaint: Complaint,
    changes: list[str],
    update: AdminUpdateComplaint,
) -> None:
    log = AuditLog(
        organization_id=complaint.organization_id,
        actor_id=current_user.user_id,
        action="admin_update",
        target_type="complaint",
        target_id=str(complaint.id),
        metadata_json={
            "changes": changes,
            "new_status": update.status,
            "new_priority": update.priority,
            "new_department_id": str(update.department_id) if update.department_id else None,
            "new_category_id": str(update.category_id) if update.category_id else None,
        },
    )
    db.add(log)


# ── Notification helper ───────────────────────────────────────────────────────

def _create_notification(
    db: Session,
    user_id: UUID,
    ntype: str,
    message: str,
    complaint_id: UUID | None = None,
) -> None:
    try:
        notif = Notification(
            user_id=user_id,
            type=ntype,
            message=message,
            complaint_id=complaint_id,
        )
        db.add(notif)
        db.flush()
    except Exception:
        # Notification failure must never block complaint processing
        pass


# ── Duplicate cluster detail ──────────────────────────────────────────────────

def get_duplicate_cluster(
    db: Session,
    cluster_id: UUID,
    current_user: CurrentUser,
) -> dict:
    """Return cluster detail with member complaints."""
    cluster = (
        db.query(DuplicateCluster)
        .filter(DuplicateCluster.id == cluster_id)
        .first()
    )
    if not cluster:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Duplicate cluster not found.",
        )

    members = (
        db.query(Complaint)
        .filter(Complaint.duplicate_cluster_id == cluster_id)
        .order_by(Complaint.created_at.desc())
        .all()
    )

    return {
        "id": cluster.id,
        "summary": cluster.summary,
        "member_count": len(members),
        "members": [
            {
                "id": c.id,
                "title": c.title,
                "status": c.status,
                "priority": c.priority,
                "created_at": c.created_at.isoformat(),
            }
            for c in members
        ],
    }


# ── Notifications ─────────────────────────────────────────────────────────────

def get_user_notifications(
    db: Session, current_user: CurrentUser, unread_only: bool = False
) -> list[Notification]:
    """Return notifications for the authenticated user."""
    query = db.query(Notification).filter(
        Notification.user_id == current_user.user_id
    )
    if unread_only:
        query = query.filter(Notification.is_read.is_(False))
    return query.order_by(Notification.created_at.desc()).limit(50).all()


def mark_notification_read(
    db: Session, notification_id: UUID, current_user: CurrentUser
) -> Notification:
    notif = (
        db.query(Notification)
        .filter(
            Notification.id == notification_id,
            Notification.user_id == current_user.user_id,
        )
        .first()
    )
    if not notif:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Notification not found.",
        )
    notif.is_read = True
    db.commit()
    db.refresh(notif)
    return notif


def mark_all_notifications_read(
    db: Session, current_user: CurrentUser
) -> int:
    count = (
        db.query(Notification)
        .filter(
            Notification.user_id == current_user.user_id,
            Notification.is_read.is_(False),
        )
        .update({"is_read": True})
    )
    db.commit()
    return count
