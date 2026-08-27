"""Analytics API endpoints — Campus Heatmap + Phase 7 Dashboard Analytics.

All endpoints require admin or super_admin role.
Department-scoped authorization is enforced in the service layer.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.middleware.auth import CurrentUser, require_role
from app.services import heatmap_service, analytics_service

router = APIRouter(
    prefix="/api/v1/analytics",
    tags=["analytics"],
    dependencies=[Depends(require_role("admin", "super_admin"))],
)

admin_user = require_role("admin", "super_admin")


# ── Phase 5: Campus Heatmap ──────────────────────────────────────────────────

@router.get("/heatmap")
def get_heatmap(
    current_user: CurrentUser = Depends(admin_user),
    db: Session = Depends(get_db),
):
    """Return campus heatmap data: zone statistics and complaint/cluster markers."""
    return heatmap_service.get_heatmap_data(db, current_user)


# ── Phase 7: Dashboard Analytics ─────────────────────────────────────────────

@router.get("/complaints")
def analytics_complaints(
    current_user: CurrentUser = Depends(admin_user),
    db: Session = Depends(get_db),
):
    """Complaint volume statistics — total, open, resolved, resolution rate."""
    return analytics_service.get_complaint_volume(db, current_user)


@router.get("/urgency")
def analytics_urgency(
    current_user: CurrentUser = Depends(admin_user),
    db: Session = Depends(get_db),
):
    """Urgency/priority distribution across visible complaints."""
    return analytics_service.get_urgency_distribution(db, current_user)


@router.get("/categories")
def analytics_categories(
    current_user: CurrentUser = Depends(admin_user),
    db: Session = Depends(get_db),
):
    """Category distribution — complaint count per category."""
    return analytics_service.get_category_distribution(db, current_user)


@router.get("/locations")
def analytics_locations(
    current_user: CurrentUser = Depends(admin_user),
    db: Session = Depends(get_db),
):
    """Location/zone statistics — complaint count per campus zone."""
    return analytics_service.get_location_stats(db, current_user)


@router.get("/duplicates")
def analytics_duplicates(
    current_user: CurrentUser = Depends(admin_user),
    db: Session = Depends(get_db),
):
    """Top duplicate clusters with member counts."""
    return analytics_service.get_duplicate_stats(db, current_user)


@router.get("/departments")
def analytics_departments(
    current_user: CurrentUser = Depends(admin_user),
    db: Session = Depends(get_db),
):
    """Department performance — per-department complaint statistics."""
    return analytics_service.get_department_performance(db, current_user)
