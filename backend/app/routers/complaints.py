"""Complaint API endpoints — CRUD, attachments, history, reference data."""

from __future__ import annotations

import json
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.database import get_db
from app.middleware.auth import CurrentUser, get_current_user, require_role
from app.models.attachment import Attachment
from app.models.campus_zone import CampusZone
from app.models.category import Category
from app.models.department import Department
from app.schemas.complaint import (
    AttachmentResponse,
    ComplaintDetailResponse,
    ComplaintListItem,
    ComplaintListResponse,
    CreateComplaintFields,
    HistoryEntryResponse,
)
from app.services import complaint_service
from app.utils.file_storage import get_file_path

router = APIRouter(prefix="/api/v1", tags=["complaints"])


# ── POST /complaints ─────────────────────────────────────────────────────────

@router.post("/complaints", status_code=201)
async def create_complaint(
    title: str = Form(..., max_length=500),
    description: str = Form(..., max_length=10_000),
    zone_id: str | None = Form(None),
    category_id: str | None = Form(None),
    file: UploadFile | None = File(None),
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Create a new complaint with an optional file attachment.

    The complaint is saved BEFORE any AI processing.
    AI failure never prevents complaint submission.
    """
    # Parse optional UUIDs
    parsed_zone = UUID(zone_id) if zone_id else None
    parsed_cat = UUID(category_id) if category_id else None

    fields = CreateComplaintFields(
        title=title.strip(),
        description=description.strip(),
        zone_id=parsed_zone,
        category_id=parsed_cat,
    )

    complaint = await complaint_service.create_complaint(
        db, current_user, fields, file
    )
    return {"data": {"id": str(complaint.id), "status": complaint.status}}


# ── GET /complaints ──────────────────────────────────────────────────────────

@router.get("/complaints", response_model=ComplaintListResponse)
def list_complaints(
    page: int = 1,
    per_page: int = 20,
    status: str | None = None,
    priority: str | None = None,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List complaints visible to the authenticated user (paginated)."""
    result = complaint_service.list_complaints(
        db, current_user, page=page, per_page=per_page,
        status_filter=status, priority_filter=priority,
    )

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


# ── GET /complaints/stats ─ (BEFORE {complaint_id} routes) ───────────────────

@router.get("/complaints/stats")
def complaint_stats(
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return complaint statistics for the authenticated user's scope."""
    return complaint_service.get_user_complaint_stats(db, current_user)


# ── Reference endpoints (categories + zones for dropdowns) ────────────────────

@router.get("/reference/categories")
def list_categories(
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return active categories for the user's organization."""
    cats = (
        db.query(Category)
        .filter(
            Category.organization_id == current_user.organization_id,
            Category.is_active.is_(True),
        )
        .order_by(Category.name)
        .all()
    )
    return [
        {"id": str(c.id), "name": c.name, "description": c.description}
        for c in cats
    ]


@router.get("/reference/zones")
def list_zones(
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return active campus zones for the user's organization."""
    zones = (
        db.query(CampusZone)
        .filter(
            CampusZone.organization_id == current_user.organization_id,
            CampusZone.is_active.is_(True),
        )
        .order_by(CampusZone.name)
        .all()
    )
    return [
        {"id": str(z.id), "name": z.name, "zone_type": z.zone_type}
        for z in zones
    ]


# ── GET /complaints/{complaint_id} ────────────────────────────────────────────

@router.get("/complaints/{complaint_id}", response_model=ComplaintDetailResponse)
def get_complaint(
    complaint_id: UUID,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return an authorized complaint with full detail."""
    c = complaint_service.get_complaint(db, complaint_id, current_user)

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
                "department": c.ai_prediction.department,
                "routing_confidence": c.ai_prediction.routing_confidence,
                "duplicate_detected": c.ai_prediction.duplicate_detected,
                "needs_manual_review": c.ai_prediction.needs_manual_review,
                "provider": c.ai_prediction.provider,
            }
        ),
    )


# ── GET /complaints/{complaint_id}/history ────────────────────────────────────

@router.get(
    "/complaints/{complaint_id}/history",
    response_model=list[HistoryEntryResponse],
)
def get_complaint_history(
    complaint_id: UUID,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return the append-only timeline for a complaint."""
    history = complaint_service.get_complaint_history(db, complaint_id, current_user)
    return [HistoryEntryResponse.model_validate(h) for h in history]


# ── GET /complaints/{complaint_id}/attachments/{attachment_id}/download ──────

@router.get(
    "/complaints/{complaint_id}/attachments/{attachment_id}/download"
)
def download_attachment(
    complaint_id: UUID,
    attachment_id: UUID,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Download an attachment file. Access is authorized via the complaint."""
    # Verify complaint access first
    complaint_service.get_complaint(db, complaint_id, current_user)

    attachment = (
        db.query(Attachment)
        .filter(
            Attachment.id == attachment_id,
            Attachment.complaint_id == complaint_id,
        )
        .first()
    )
    if not attachment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Attachment not found.",
        )

    file_path = get_file_path(attachment.stored_filename)
    if not file_path.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="File not found on disk.",
        )

    return FileResponse(
        path=str(file_path),
        filename=attachment.original_filename,
        media_type=attachment.file_type,
    )



