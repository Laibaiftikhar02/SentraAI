"""Campus Heatmap analytics — zone statistics and marker aggregation.

Key rules (PMD v2.2 §18.1 / PLAN Phase 5):
- Heat intensity ≠ urgency.  Heat represents issue concentration / impact context.
- Raw duplicate-report count does NOT inflate heat.
- Heat intensity = distinctIssueClusters / max(distinctIssueClusters across all zones).
- Zones with 0 complaints → neutral / no heat.
- Markers = urgency (Critical=red, High=orange, Medium=yellow, Low=green).
- A single Critical complaint remains visible as a prominent marker even if alone.
- Duplicate clusters are shown as ONE marker with a visible report count.
- Department-scoped visibility is enforced (admin sees their depts + General Review).
"""

from __future__ import annotations

from collections import defaultdict
from uuid import UUID

from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from app.middleware.auth import CurrentUser
from app.models.admin_department import AdminDepartment
from app.models.ai_prediction import AIPrediction
from app.models.campus_zone import CampusZone
from app.models.complaint import Complaint
from app.models.duplicate_cluster import DuplicateCluster


# ── Authorization helpers ─────────────────────────────────────────────────────

def _get_admin_department_ids(db: Session, user_id: UUID) -> list[UUID]:
    rows = (
        db.query(AdminDepartment.department_id)
        .filter(AdminDepartment.user_id == user_id)
        .all()
    )
    return [r[0] for r in rows]


def _apply_visibility(query, current_user: CurrentUser, db: Session):
    """Apply role-based visibility filter to complaint queries."""
    if current_user.role == "super_admin":
        return query.filter(Complaint.organization_id == current_user.organization_id)
    elif current_user.role == "admin":
        dept_ids = _get_admin_department_ids(db, current_user.user_id)
        if not dept_ids:
            return query.filter(Complaint.department_id.is_(None))
        from sqlalchemy import or_
        return query.filter(
            or_(
                Complaint.department_id.in_(dept_ids),
                Complaint.department_id.is_(None),
            )
        )
    return query.filter(Complaint.organization_id == current_user.organization_id)


# ── Geometry helpers ──────────────────────────────────────────────────────────

def _polygon_centroid(polygon: list) -> tuple[float, float]:
    """Calculate the centroid of a polygon defined by [[x,y], ...] coordinates."""
    if not polygon:
        return (0.0, 0.0)
    n = len(polygon)
    cx = sum(p[0] for p in polygon) / n
    cy = sum(p[1] for p in polygon) / n
    return (cx, cy)


# ── Priority ordering ────────────────────────────────────────────────────────

_PRIORITY_ORDER = {"critical": 4, "high": 3, "medium": 2, "low": 1}


def _higher_priority(a: str | None, b: str | None) -> str | None:
    """Return the higher of two priority strings."""
    if not a:
        return b
    if not b:
        return a
    return a if _PRIORITY_ORDER.get(a, 0) >= _PRIORITY_ORDER.get(b, 0) else b


# ── Main heatmap aggregation ──────────────────────────────────────────────────

def get_heatmap_data(
    db: Session,
    current_user: CurrentUser,
) -> dict:
    """Build the complete heatmap response: zones[] and markers[].

    PLAN Phase 5 deliverable 1 schema:
    {
      zones: [{ zoneId, zoneName, totalReports, distinctIssueClusters,
                urgencyDistribution, heatIntensity, polygon, centroid }],
      markers: [{ markerId, markerType, zoneId, urgency, reportCount,
                  complaintIds/clusterId, summary, category, department,
                  confidence, position }]
    }
    """
    org_id = current_user.organization_id

    # 1. Fetch all active zones for the organization
    zones_db = (
        db.query(CampusZone)
        .filter(
            CampusZone.organization_id == org_id,
            CampusZone.is_active.is_(True),
        )
        .order_by(CampusZone.name)
        .all()
    )

    if not zones_db:
        return {"zones": [], "markers": []}

    zone_ids = [z.id for z in zones_db]

    # 2. Fetch all visible complaints in these zones (with relationships)
    complaints_query = (
        db.query(Complaint)
        .options(
            joinedload(Complaint.department),
            joinedload(Complaint.category),
            joinedload(Complaint.ai_prediction),
        )
        .filter(Complaint.zone_id.in_(zone_ids))
    )
    complaints_query = _apply_visibility(complaints_query, current_user, db)
    complaints = complaints_query.all()

    # 3. Build per-zone statistics
    zone_stats: dict[UUID, dict] = {}
    for z in zones_db:
        zone_stats[z.id] = {
            "zoneId": str(z.id),
            "zoneName": z.name,
            "zoneType": z.zone_type,
            "polygon": z.polygon_json,
            "centroid": _polygon_centroid(z.polygon_json) if z.polygon_json else (0, 0),
            "totalReports": 0,
            "distinctIssueClusters": 0,
            "urgencyDistribution": {"critical": 0, "high": 0, "medium": 0, "low": 0},
            # Internal tracking (not returned)
            "_cluster_ids": set(),
            "_standalone_count": 0,
        }

    # 4. Categorize complaints per zone
    # Track clusters per zone for marker generation
    zone_clusters: dict[UUID, dict[UUID, list[Complaint]]] = defaultdict(lambda: defaultdict(list))

    for c in complaints:
        zid = c.zone_id
        if zid not in zone_stats:
            continue

        stats = zone_stats[zid]
        stats["totalReports"] += 1

        # Urgency distribution (use complaint priority)
        p = (c.priority or "").lower()
        if p in stats["urgencyDistribution"]:
            stats["urgencyDistribution"][p] += 1

        # Cluster tracking
        if c.duplicate_cluster_id:
            stats["_cluster_ids"].add(c.duplicate_cluster_id)
            zone_clusters[zid][c.duplicate_cluster_id].append(c)
        else:
            stats["_standalone_count"] += 1

    # 5. Calculate distinctIssueClusters and heatIntensity
    # distinctIssueClusters = distinct cluster count + standalone complaint count
    # Each standalone complaint is considered its own distinct issue.
    max_clusters = 0
    for stats in zone_stats.values():
        distinct = len(stats["_cluster_ids"]) + stats["_standalone_count"]
        stats["distinctIssueClusters"] = distinct
        if distinct > max_clusters:
            max_clusters = distinct

    for stats in zone_stats.values():
        if max_clusters > 0:
            stats["heatIntensity"] = round(stats["distinctIssueClusters"] / max_clusters, 4)
        else:
            stats["heatIntensity"] = 0.0

    # 6. Build markers
    markers: list[dict] = []

    for z in zones_db:
        zid = z.id
        stats = zone_stats[zid]
        centroid = stats["centroid"]

        # 6a. Duplicate cluster markers (one per cluster per zone)
        cluster_offset_idx = 0
        for cluster_id, cluster_complaints in zone_clusters[zid].items():
            report_count = len(cluster_complaints)
            # Highest urgency among cluster members
            highest_urgency = None
            for cc in cluster_complaints:
                highest_urgency = _higher_priority(highest_urgency, cc.priority)

            # Use first complaint's AI info as representative
            rep = cluster_complaints[0]
            ai = rep.ai_prediction

            # Offset cluster markers slightly around centroid for visual separation
            offset_x = centroid[0] + (cluster_offset_idx * 15) - 7
            offset_y = centroid[1] + 10

            markers.append({
                "markerId": f"cluster_{cluster_id}",
                "markerType": "duplicate_cluster",
                "zoneId": str(zid),
                "urgency": highest_urgency or "medium",
                "reportCount": report_count,
                "clusterId": str(cluster_id),
                "complaintIds": [str(cc.id) for cc in cluster_complaints],
                "summary": ai.summary if ai else None,
                "category": rep.category.name if rep.category else None,
                "department": rep.department.name if rep.department else None,
                "confidence": ai.routing_confidence if ai else None,
                "position": [round(offset_x, 1), round(offset_y, 1)],
            })
            cluster_offset_idx += 1

        # 6b. Standalone complaint markers (individual, not in a cluster)
        standalone_offset_idx = 0
        for c in complaints:
            if c.zone_id != zid or c.duplicate_cluster_id:
                continue
            ai = c.ai_prediction

            # Spread standalone markers within the zone polygon area
            polygon = stats["polygon"]
            if polygon and len(polygon) >= 3:
                # Distribute points within the bounding box of the polygon
                xs = [p[0] for p in polygon]
                ys = [p[1] for p in polygon]
                min_x, max_x = min(xs), max(xs)
                min_y, max_y = min(ys), max(ys)
                w = max_x - min_x
                h = max_y - min_y
                # Simple grid-based distribution
                cols = max(1, int(w / 40))
                row = standalone_offset_idx // cols
                col = standalone_offset_idx % cols
                px = min_x + (col + 0.5) * (w / cols)
                py = min_y + (row + 0.5) * (h / max(1, (len([cc for cc in complaints if cc.zone_id == zid and not cc.duplicate_cluster_id]) // cols + 1)))
                # Clamp to bounding box
                px = max(min_x + 5, min(max_x - 5, px))
                py = max(min_y + 5, min(max_y - 5, py))
            else:
                px, py = centroid

            markers.append({
                "markerId": f"complaint_{c.id}",
                "markerType": "complaint",
                "zoneId": str(zid),
                "urgency": (c.priority or "medium").lower(),
                "reportCount": 1,
                "complaintId": str(c.id),
                "complaintIds": [str(c.id)],
                "summary": ai.summary if ai else None,
                "category": c.category.name if c.category else None,
                "department": c.department.name if c.department else None,
                "confidence": ai.routing_confidence if ai else None,
                "position": [round(px, 1), round(py, 1)],
            })
            standalone_offset_idx += 1

    # 7. Clean internal tracking from zone stats before returning
    zones_out = []
    for z in zones_db:
        stats = zone_stats[z.id]
        zones_out.append({
            "zoneId": stats["zoneId"],
            "zoneName": stats["zoneName"],
            "zoneType": stats["zoneType"],
            "totalReports": stats["totalReports"],
            "distinctIssueClusters": stats["distinctIssueClusters"],
            "urgencyDistribution": stats["urgencyDistribution"],
            "heatIntensity": stats["heatIntensity"],
            "polygon": stats["polygon"],
            "centroid": list(stats["centroid"]),
        })

    return {"zones": zones_out, "markers": markers}
