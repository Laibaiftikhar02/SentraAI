"""Admin complaint management API endpoints.

All endpoints require admin or super_admin role.
Department-scoped authorization is enforced per complaint.
"""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.middleware.auth import CurrentUser, require_role
from app.schemas.admin import (
    AdminUpdateComplaint,
    ClusterComplaintItem,
    DuplicateClusterResponse,
    NotificationResponse,
)
from app.schemas.complaint import (
    AttachmentResponse,
    ComplaintDetailResponse,
    ComplaintListItem,
    ComplaintListResponse,
)
from app.models.complaint_history import ComplaintHistory
from app.models.user import User as UserModel
from app.services import admin_service, complaint_service

router = APIRouter(
    prefix="/api/v1/admin",
    tags=["admin"],
    dependencies=[Depends(require_role("admin", "super_admin"))],
)

admin_user = require_role("admin", "super_admin")


# ── Admin complaint list (enhanced) ───────────────────────────────────────────

@router.get("/complaints", response_model=ComplaintListResponse)
def admin_list_complaints(
    page: int = 1,
    per_page: int = 20,
    status: str | None = None,
    priority: str | None = None,
    category: str | None = None,
    zone: str | None = None,
    department: str | None = None,
    search: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
    current_user: CurrentUser = Depends(admin_user),
    db: Session = Depends(get_db),
):
    """List complaints visible to the admin (department-scoped, enhanced filters)."""
    result = complaint_service.list_complaints(
        db, current_user, page=page, per_page=per_page,
        status_filter=status, priority_filter=priority,
        category_filter=category, zone_filter=zone,
        department_filter=department,
        search_filter=search,
        date_from=date_from, date_to=date_to,
    )

    # Resolve assigned admin names from reassignment history
    complaint_ids = [c.id for c in result["items"]]
    assigned_admin_map: dict = {}
    if complaint_ids:
        from sqlalchemy import func
        # Get the most recent reassignment history entry per complaint
        latest_reassignments = (
            db.query(
                ComplaintHistory.complaint_id,
                func.max(ComplaintHistory.created_at).label("max_created"),
            )
            .filter(
                ComplaintHistory.complaint_id.in_(complaint_ids),
                ComplaintHistory.action == "reassigned",
            )
            .group_by(ComplaintHistory.complaint_id)
            .subquery()
        )
        reassign_entries = (
            db.query(ComplaintHistory)
            .join(
                latest_reassignments,
                (ComplaintHistory.complaint_id == latest_reassignments.c.complaint_id)
                & (ComplaintHistory.created_at == latest_reassignments.c.max_created),
            )
            .all()
        )
        # Collect target user IDs from metadata
        target_ids = set()
        entry_by_complaint: dict = {}
        for entry in reassign_entries:
            entry_by_complaint[entry.complaint_id] = entry
            meta = entry.metadata_json
            if meta and "target_user_id" in meta:
                target_ids.add(meta["target_user_id"])
        # Batch-load user names
        user_name_map: dict = {}
        if target_ids:
            users = (
                db.query(UserModel.id, UserModel.name)
                .filter(UserModel.id.in_(target_ids))
                .all()
            )
            user_name_map = {str(u.id): u.name for u in users}
        # Build the complaint_id → admin name map
        for cid, entry in entry_by_complaint.items():
            meta = entry.metadata_json
            if meta and "target_user_id" in meta:
                name = user_name_map.get(meta["target_user_id"])
                if name:
                    assigned_admin_map[cid] = name
            # Fallback: use new_value (the admin name stored at reassignment time)
            if cid not in assigned_admin_map and entry.new_value:
                assigned_admin_map[cid] = entry.new_value

    items: list[ComplaintListItem] = []
    for c in result["items"]:
        items.append(
            ComplaintListItem(
                id=c.id,
                title=c.title,
                status=c.status,
                priority=c.priority,
                ai_status=c.ai_status,
                category_name=c.category.name if c.category else None,
                department_name=c.department.name if c.department else None,
                zone_name=c.zone.name if c.zone else None,
                ai_summary=(
                    c.ai_prediction.summary[:120] + "..."
                    if c.ai_prediction and c.ai_prediction.summary and len(c.ai_prediction.summary) > 120
                    else (c.ai_prediction.summary if c.ai_prediction else None)
                ),
                assigned_admin=assigned_admin_map.get(c.id),
                created_at=c.created_at,
                updated_at=c.updated_at,
                attachment_count=len(c.attachments),
            )
        )

    return ComplaintListResponse(
        items=items,
        total=result["total"],
        page=result["page"],
        per_page=result["per_page"],
    )


# ── Admin complaint detail ────────────────────────────────────────────────────

@router.get("/complaints/{complaint_id}", response_model=ComplaintDetailResponse)
def admin_complaint_detail(
    complaint_id: UUID,
    current_user: CurrentUser = Depends(admin_user),
    db: Session = Depends(get_db),
):
    """Full complaint detail for admin review."""
    c = admin_service.get_admin_complaint(db, complaint_id, current_user)

    return ComplaintDetailResponse(
        id=c.id,
        title=c.title,
        description=c.description,
        status=c.status,
        priority=c.priority,
        ai_status=c.ai_status,
        organization_id=c.organization_id,
        user_id=c.user_id,
        department_id=c.department_id,
        zone_id=c.zone_id,
        category_id=c.category_id,
        duplicate_cluster_id=c.duplicate_cluster_id,
        created_at=c.created_at,
        updated_at=c.updated_at,
        department_name=c.department.name if c.department else None,
        zone_name=c.zone.name if c.zone else None,
        category_name=c.category.name if c.category else None,
        submitter_name=c.user.name if c.user else None,
        attachments=[
            AttachmentResponse.model_validate(a) for a in c.attachments
        ],
        ai_prediction=(
            None
            if not c.ai_prediction
            else {
                "summary": c.ai_prediction.summary,
                "category": c.ai_prediction.category,
                "category_confidence": c.ai_prediction.category_confidence,
                "priority": c.ai_prediction.priority,
                "priority_confidence": c.ai_prediction.priority_confidence,
                "priority_rationale": c.ai_prediction.priority_rationale,
                "department": c.ai_prediction.department,
                "routing_confidence": c.ai_prediction.routing_confidence,
                "duplicate_detected": c.ai_prediction.duplicate_detected,
                "duplicate_cluster_id": c.ai_prediction.duplicate_cluster_id,
                "needs_manual_review": c.ai_prediction.needs_manual_review,
                "provider": c.ai_prediction.provider,
            }
        ),
    )


# ── PATCH admin/complaints/{id} ──────────────────────────────────────────────

@router.patch("/complaints/{complaint_id}")
def admin_update_complaint(
    complaint_id: UUID,
    body: AdminUpdateComplaint,
    current_user: CurrentUser = Depends(admin_user),
    db: Session = Depends(get_db),
):
    """Update a complaint — accept/modify AI, reassign, status, notes, respond."""
    c = admin_service.admin_update_complaint(
        db, complaint_id, current_user, body
    )
    return {
        "data": {
            "id": str(c.id),
            "status": c.status,
            "priority": c.priority,
            "department_id": str(c.department_id) if c.department_id else None,
            "category_id": str(c.category_id) if c.category_id else None,
        }
    }


# ── Duplicate cluster detail ──────────────────────────────────────────────────

@router.get("/clusters/{cluster_id}")
def admin_cluster_detail(
    cluster_id: UUID,
    current_user: CurrentUser = Depends(admin_user),
    db: Session = Depends(get_db),
):
    """Return duplicate cluster detail with member complaints."""
    data = admin_service.get_duplicate_cluster(db, cluster_id, current_user)
    return DuplicateClusterResponse(
        id=data["id"],
        summary=data["summary"],
        member_count=data["member_count"],
        members=[
            ClusterComplaintItem(
                id=m["id"],
                title=m["title"],
                status=m["status"],
                priority=m["priority"],
                created_at=m["created_at"],
            )
            for m in data["members"]
        ],
    )


# ── Notifications ─────────────────────────────────────────────────────────────

@router.get("/notifications")
def admin_notifications(
    unread_only: bool = Query(False),
    current_user: CurrentUser = Depends(admin_user),
    db: Session = Depends(get_db),
):
    """Return notifications for the authenticated admin."""
    notifs = admin_service.get_user_notifications(
        db, current_user, unread_only=unread_only
    )
    return [
        NotificationResponse(
            id=n.id,
            type=n.type,
            message=n.message,
            is_read=n.is_read,
            complaint_id=n.complaint_id,
            created_at=n.created_at.isoformat(),
        )
        for n in notifs
    ]


@router.patch("/notifications/{notification_id}/read")
def admin_mark_notification_read(
    notification_id: UUID,
    current_user: CurrentUser = Depends(admin_user),
    db: Session = Depends(get_db),
):
    notif = admin_service.mark_notification_read(
        db, notification_id, current_user
    )
    return {"id": str(notif.id), "is_read": notif.is_read}


@router.post("/notifications/read-all")
def admin_mark_all_read(
    current_user: CurrentUser = Depends(admin_user),
    db: Session = Depends(get_db),
):
    count = admin_service.mark_all_notifications_read(db, current_user)
    return {"marked_read": count}


# ── Admin departments (for reassignment dropdown) ─────────────────────────────

@router.get("/departments")
def admin_list_departments(
    current_user: CurrentUser = Depends(admin_user),
    db: Session = Depends(get_db),
):
    """Return departments in the admin's organization."""
    from app.models.department import Department

    depts = (
        db.query(Department)
        .filter(
            Department.organization_id == current_user.organization_id,
            Department.is_active.is_(True),
        )
        .order_by(Department.name)
        .all()
    )
    return [{"id": str(d.id), "name": d.name} for d in depts]


@router.get("/admins")
def admin_list_admins(
    current_user: CurrentUser = Depends(admin_user),
    db: Session = Depends(get_db),
):
    """Return admin users in the same organization (for reassignment)."""
    from app.models.user import User

    admins = (
        db.query(User)
        .filter(
            User.organization_id == current_user.organization_id,
            User.role.in_(["admin", "super_admin"]),
            User.is_active.is_(True),
        )
        .order_by(User.name)
        .all()
    )
    return [
        {"id": str(a.id), "name": a.name, "email": a.email, "role": a.role}
        for a in admins
    ]
