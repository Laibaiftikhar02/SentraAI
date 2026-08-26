"""Analytics API endpoints — Campus Heatmap.

All endpoints require admin or super_admin role.
Department-scoped authorization is enforced in the service layer.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.middleware.auth import CurrentUser, require_role
from app.services import heatmap_service

router = APIRouter(
    prefix="/api/v1/analytics",
    tags=["analytics"],
    dependencies=[Depends(require_role("admin", "super_admin"))],
)

admin_user = require_role("admin", "super_admin")


@router.get("/heatmap")
def get_heatmap(
    current_user: CurrentUser = Depends(admin_user),
    db: Session = Depends(get_db),
):
    """Return campus heatmap data: zone statistics and complaint/cluster markers.

    Response schema (PLAN Phase 5 Deliverable 1):
    {
      zones: [{ zoneId, zoneName, zoneType, totalReports, distinctIssueClusters,
                urgencyDistribution, heatIntensity, polygon, centroid }],
      markers: [{ markerId, markerType, zoneId, urgency, reportCount,
                  clusterId/complaintId, complaintIds, summary, category,
                  department, confidence, position }]
    }
    """
    return heatmap_service.get_heatmap_data(db, current_user)
