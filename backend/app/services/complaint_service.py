"""Complaint business logic — creation, listing, detail, history.

Key rules (from PMD v2.2 / API Contract / DB Design):
- Complaint creation NEVER depends on AI availability.
- Original complaint content is authoritative and immutable.
- Complaint history is append-only.
- Users see only their own complaints.
- Department Admins see complaints within their assigned department scope.
- Super Admins see organization-level complaints.
"""

from __future__ import annotations

from uuid import UUID

from fastapi import HTTPException, status, UploadFile
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from app.middleware.auth import CurrentUser
from app.models.attachment import Attachment
from app.models.admin_department import AdminDepartment
from app.models.campus_zone import CampusZone
from app.models.category import Category
from app.models.complaint import Complaint
from app.models.complaint_history import ComplaintHistory
from app.models.department import Department
from app.models.user import User
from app.schemas.complaint import CreateComplaintFields
from app.services.ai_processing import process_complaint_ai
from app.utils.file_storage import save_upload


# ── Authorization helpers ─────────────────────────────────────────────────────

def _get_admin_department_ids(db: Session, user_id: UUID) -> list[UUID]:
    """Return the department IDs a Department Admin is assigned to."""
    rows = (
        db.query(AdminDepartment.department_id)
        .filter(AdminDepartment.user_id == user_id)
        .all()
    )
    return [r[0] for r in rows]


def _complaint_visibility_filter(
    query,
    current_user: CurrentUser,
    db: Session,
):
    """Apply role-based visibility filter to a complaint query."""
    if current_user.role == "super_admin":
        return query.filter(Complaint.organization_id == current_user.organization_id)
    elif current_user.role == "admin":
        dept_ids = _get_admin_department_ids(db, current_user.user_id)
        if not dept_ids:
            # Admin with no department assignments → only General Review
            return query.filter(Complaint.department_id.is_(None))
        # Admin sees complaints in their department(s) OR General Review (null dept)
        from sqlalchemy import or_
        return query.filter(
            or_(
                Complaint.department_id.in_(dept_ids),
                Complaint.department_id.is_(None),
            )
        )
    else:
        # Regular user: own complaints only
        return query.filter(Complaint.user_id == current_user.user_id)


# ── Create ────────────────────────────────────────────────────────────────────

async def create_complaint(
    db: Session,
    current_user: CurrentUser,
    fields: CreateComplaintFields,
    file: UploadFile | None = None,
) -> Complaint:
    """Persist a new complaint with optional attachment, then trigger AI triage.

    The complaint is always saved FIRST.  AI processing runs afterwards
    and never prevents the complaint from being stored (PMD / AI Contract §14).
    """
    # Validate zone belongs to org if provided
    if fields.zone_id:
        zone = (
            db.query(CampusZone)
            .filter(
                CampusZone.id == fields.zone_id,
                CampusZone.organization_id == current_user.organization_id,
                CampusZone.is_active.is_(True),
            )
            .first()
        )
        if not zone:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Invalid or inactive campus zone.",
            )

    # Validate category belongs to org if provided
    if fields.category_id:
        cat = (
            db.query(Category)
            .filter(
                Category.id == fields.category_id,
                Category.organization_id == current_user.organization_id,
                Category.is_active.is_(True),
            )
            .first()
        )
        if not cat:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Invalid or inactive category.",
            )

    # 1. Create the complaint record FIRST (PMD rule: save before AI)
    complaint = Complaint(
        organization_id=current_user.organization_id,
        user_id=current_user.user_id,
        title=fields.title,
        description=fields.description,
        zone_id=fields.zone_id,
        category_id=fields.category_id,
        status="created",
        ai_status=None,  # No AI processing in Phase 2
    )
    db.add(complaint)
    db.flush()  # Get the complaint.id

    # 2. Save attachment if provided
    if file and file.filename:
        stored_filename, original_filename, file_size = await save_upload(file)
        attachment = Attachment(
            complaint_id=complaint.id,
            original_filename=original_filename,
            stored_filename=stored_filename,
            file_type=file.content_type or "application/octet-stream",
            file_size=file_size,
            uploader_id=current_user.user_id,
        )
        db.add(attachment)

    # 3. Append-only history entry for creation
    history = ComplaintHistory(
        complaint_id=complaint.id,
        action="created",
        new_value="created",
        actor_id=current_user.user_id,
    )
    db.add(history)

    db.commit()
    db.refresh(complaint)

    # ── Phase 3: AI triage (runs after complaint is safely persisted) ──
    process_complaint_ai(db, complaint)
    db.refresh(complaint)

    return complaint


# ── List ──────────────────────────────────────────────────────────────────────

def list_complaints(
    db: Session,
    current_user: CurrentUser,
    page: int = 1,
    per_page: int = 20,
    status_filter: str | None = None,
    priority_filter: str | None = None,
    category_filter: str | None = None,
    zone_filter: str | None = None,
    department_filter: str | None = None,
    search_filter: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
) -> dict:
    """Return paginated complaints visible to the authenticated user."""
    query = (
        db.query(Complaint)
        .options(
            joinedload(Complaint.department),
            joinedload(Complaint.zone),
            joinedload(Complaint.category),
            joinedload(Complaint.attachments),
            joinedload(Complaint.ai_prediction),
        )
    )
    query = _complaint_visibility_filter(query, current_user, db)

    if status_filter:
        query = query.filter(Complaint.status == status_filter)
    if priority_filter:
        query = query.filter(Complaint.priority == priority_filter)
    if category_filter:
        query = query.filter(Complaint.category_id == category_filter)
    if zone_filter:
        query = query.filter(Complaint.zone_id == zone_filter)
    if department_filter:
        query = query.filter(Complaint.department_id == department_filter)
    if search_filter:
        from sqlalchemy import or_
        pattern = f"%{search_filter}%"
        query = query.filter(
            or_(
                Complaint.title.ilike(pattern),
                Complaint.description.ilike(pattern),
            )
        )
    if date_from:
        from datetime import datetime, timezone
        try:
            dt = datetime.fromisoformat(date_from).replace(tzinfo=timezone.utc)
            query = query.filter(Complaint.created_at >= dt)
        except (ValueError, TypeError):
            pass
    if date_to:
        from datetime import datetime, timezone, timedelta
        try:
            dt = datetime.fromisoformat(date_to).replace(tzinfo=timezone.utc)
            # Include the entire end date (end of day)
            query = query.filter(Complaint.created_at < dt + timedelta(days=1))
        except (ValueError, TypeError):
            pass

    total = query.count()
    complaints = (
        query.order_by(Complaint.created_at.desc())
        .offset((page - 1) * per_page)
        .limit(per_page)
        .all()
    )

    return {
        "items": complaints,
        "total": total,
        "page": page,
        "per_page": per_page,
    }


# ── Detail ────────────────────────────────────────────────────────────────────

def get_complaint(
    db: Session,
    complaint_id: UUID,
    current_user: CurrentUser,
) -> Complaint:
    """Return a single complaint with authorization check."""
    complaint = (
        db.query(Complaint)
        .options(
            joinedload(Complaint.department),
            joinedload(Complaint.zone),
            joinedload(Complaint.category),
            joinedload(Complaint.user),
            joinedload(Complaint.attachments),
            joinedload(Complaint.ai_prediction),
        )
        .filter(Complaint.id == complaint_id)
        .first()
    )
    if not complaint:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Complaint not found.",
        )

    # Authorization check
    _authorize_complaint_access(db, current_user, complaint)
    return complaint


def _authorize_complaint_access(
    db: Session,
    current_user: CurrentUser,
    complaint: Complaint,
) -> None:
    """Raise 403/404 if user cannot access this complaint."""
    if current_user.role == "super_admin":
        if complaint.organization_id != current_user.organization_id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Complaint not found.",
            )
    elif current_user.role == "admin":
        dept_ids = _get_admin_department_ids(db, current_user.user_id)
        if complaint.department_id not in dept_ids:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have access to this complaint.",
            )
    else:
        # Regular user: own complaints only
        if complaint.user_id != current_user.user_id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Complaint not found.",
            )


# ── History ───────────────────────────────────────────────────────────────────

def get_complaint_history(
    db: Session,
    complaint_id: UUID,
    current_user: CurrentUser,
) -> list[ComplaintHistory]:
    """Return the append-only timeline for an authorized complaint."""
    # First verify access via get_complaint (raises 403/404 if unauthorized)
    get_complaint(db, complaint_id, current_user)

    history = (
        db.query(ComplaintHistory)
        .filter(ComplaintHistory.complaint_id == complaint_id)
        .order_by(ComplaintHistory.created_at.asc())
        .all()
    )
    return history


# ── Stats (for dashboard) ─────────────────────────────────────────────────────

def get_user_complaint_stats(db: Session, current_user: CurrentUser) -> dict:
    """Return simple complaint statistics for the authenticated user."""
    base = db.query(Complaint)

    if current_user.role == "user":
        base = base.filter(Complaint.user_id == current_user.user_id)
    elif current_user.role == "admin":
        dept_ids = _get_admin_department_ids(db, current_user.user_id)
        if dept_ids:
            from sqlalchemy import or_ as _or
            base = base.filter(
                _or(
                    Complaint.department_id.in_(dept_ids),
                    Complaint.department_id.is_(None),
                )
            )
        else:
            base = base.filter(Complaint.department_id.is_(None))
    else:
        base = base.filter(Complaint.organization_id == current_user.organization_id)

    total = base.count()
    open_count = base.filter(Complaint.status.in_(["created", "assigned", "in_progress", "reopened"])).count()
    resolved_count = base.filter(Complaint.status.in_(["resolved", "closed"])).count()
    high_priority = base.filter(Complaint.priority.in_(["critical", "high"])).count()

    return {
        "total": total,
        "open": open_count,
        "resolved": resolved_count,
        "high_priority": high_priority,
    }
