"""Analytics service — Phase 7 dashboard data aggregation.

All analytics are derived from real database records.
No fake/mock data is ever generated.
Authorization scoping follows the same rules as complaint visibility:
- Super Admin: organization-wide
- Department Admin: department-scoped + General Review
"""

from __future__ import annotations

from uuid import UUID

from sqlalchemy import func, case
from sqlalchemy.orm import Session

from app.middleware.auth import CurrentUser
from app.models.admin_department import AdminDepartment
from app.models.campus_zone import CampusZone
from app.models.category import Category
from app.models.complaint import Complaint
from app.models.department import Department
from app.models.duplicate_cluster import DuplicateCluster


# ── Authorization helper ──────────────────────────────────────────────────────

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


def _scoped_base(db: Session, current_user: CurrentUser):
    """Return a scoped base query for complaints."""
    query = db.query(Complaint)
    return _apply_visibility(query, current_user, db)


# ── Complaint Volume ─────────────────────────────────────────────────────────

def get_complaint_volume(db: Session, current_user: CurrentUser) -> dict:
    """Return complaint volume statistics.

    Returns: { total, open, resolved, closed, in_progress, created, assigned, reopened }
    """
    base = _scoped_base(db, current_user)

    total = base.count()

    # Per-status counts
    status_counts = (
        base.with_entities(Complaint.status, func.count(Complaint.id))
        .group_by(Complaint.status)
        .all()
    )
    status_map = {s: c for s, c in status_counts}

    open_statuses = ["created", "assigned", "in_progress", "reopened"]
    open_count = sum(status_map.get(s, 0) for s in open_statuses)
    resolved_count = status_map.get("resolved", 0) + status_map.get("closed", 0)

    resolution_rate = round((resolved_count / total * 100), 1) if total > 0 else 0.0

    return {
        "total": total,
        "open": open_count,
        "resolved": resolved_count,
        "pending": open_count,
        "resolution_rate": resolution_rate,
        "by_status": status_map,
    }


# ── Urgency Distribution ─────────────────────────────────────────────────────

def get_urgency_distribution(db: Session, current_user: CurrentUser) -> dict:
    """Return urgency/priority distribution.

    Returns: { critical, high, medium, low, unassigned, total }
    """
    base = _scoped_base(db, current_user)

    priority_counts = (
        base.with_entities(Complaint.priority, func.count(Complaint.id))
        .group_by(Complaint.priority)
        .all()
    )
    pmap = {p: c for p, c in priority_counts}

    return {
        "critical": pmap.get("critical", 0),
        "high": pmap.get("high", 0),
        "medium": pmap.get("medium", 0),
        "low": pmap.get("low", 0),
        "unassigned": pmap.get(None, 0),
        "total": sum(pmap.values()),
    }


# ── Category Distribution ────────────────────────────────────────────────────

def get_category_distribution(db: Session, current_user: CurrentUser) -> list[dict]:
    """Return complaint count per category.

    Returns: [{ category_name, count }]
    """
    base = _scoped_base(db, current_user)

    rows = (
        base.with_entities(Category.name, func.count(Complaint.id).label("count"))
        .outerjoin(Category, Complaint.category_id == Category.id)
        .group_by(Category.name)
        .order_by(func.count(Complaint.id).desc())
        .all()
    )

    return [
        {"category_name": name or "Uncategorized", "count": count}
        for name, count in rows
    ]


# ── Location / Zone Statistics ───────────────────────────────────────────────

def get_location_stats(db: Session, current_user: CurrentUser) -> list[dict]:
    """Return complaint count per campus zone.

    Returns: [{ zone_name, zone_type, total_reports, critical, high, medium, low }]
    """
    base = _scoped_base(db, current_user)

    rows = (
        base.with_entities(
            CampusZone.name,
            CampusZone.zone_type,
            func.count(Complaint.id).label("total_reports"),
            func.sum(case((Complaint.priority == "critical", 1), else_=0)).label("critical"),
            func.sum(case((Complaint.priority == "high", 1), else_=0)).label("high"),
            func.sum(case((Complaint.priority == "medium", 1), else_=0)).label("medium"),
            func.sum(case((Complaint.priority == "low", 1), else_=0)).label("low"),
        )
        .outerjoin(CampusZone, Complaint.zone_id == CampusZone.id)
        .group_by(CampusZone.name, CampusZone.zone_type)
        .order_by(func.count(Complaint.id).desc())
        .all()
    )

    return [
        {
            "zone_name": name or "Unassigned",
            "zone_type": ztype,
            "total_reports": total,
            "critical": crit or 0,
            "high": hi or 0,
            "medium": med or 0,
            "low": lo or 0,
        }
        for name, ztype, total, crit, hi, med, lo in rows
    ]


# ── Duplicate Cluster Statistics ─────────────────────────────────────────────

def get_duplicate_stats(db: Session, current_user: CurrentUser) -> list[dict]:
    """Return top duplicate clusters with member counts.

    Returns: [{ cluster_id, summary, member_count, highest_priority }]
    """
    base = _scoped_base(db, current_user)

    # Get complaints that belong to a cluster
    cluster_complaints = base.filter(Complaint.duplicate_cluster_id.isnot(None))

    # Aggregate per cluster
    rows = (
        cluster_complaints.with_entities(
            DuplicateCluster.id,
            DuplicateCluster.summary,
            func.count(Complaint.id).label("member_count"),
        )
        .join(DuplicateCluster, Complaint.duplicate_cluster_id == DuplicateCluster.id)
        .group_by(DuplicateCluster.id, DuplicateCluster.summary)
        .order_by(func.count(Complaint.id).desc())
        .limit(20)
        .all()
    )

    # Get highest priority per cluster
    result = []
    for cluster_id, summary, member_count in rows:
        highest = (
            cluster_complaints.with_entities(Complaint.priority)
            .filter(Complaint.duplicate_cluster_id == cluster_id)
            .all()
        )
        priority_order = {"critical": 4, "high": 3, "medium": 2, "low": 1}
        best = None
        best_rank = 0
        for (p,) in highest:
            rank = priority_order.get(p, 0)
            if rank > best_rank:
                best_rank = rank
                best = p

        result.append({
            "cluster_id": str(cluster_id),
            "summary": summary,
            "member_count": member_count,
            "highest_priority": best,
        })

    return result


# ── Department Performance ────────────────────────────────────────────────────

def get_department_performance(db: Session, current_user: CurrentUser) -> list[dict]:
    """Return per-department complaint statistics.

    Returns: [{ department_name, total, resolved, open, resolution_rate }]
    """
    base = _scoped_base(db, current_user)

    rows = (
        base.with_entities(
            Department.name,
            func.count(Complaint.id).label("total"),
            func.sum(case((Complaint.status.in_(["resolved", "closed"]), 1), else_=0)).label("resolved"),
            func.sum(case((Complaint.status.in_(["created", "assigned", "in_progress", "reopened"]), 1), else_=0)).label("open"),
        )
        .outerjoin(Department, Complaint.department_id == Department.id)
        .group_by(Department.name)
        .order_by(func.count(Complaint.id).desc())
        .all()
    )

    return [
        {
            "department_name": name or "General Review",
            "total": total,
            "resolved": res or 0,
            "open": op or 0,
            "resolution_rate": round((res or 0) / total * 100, 1) if total > 0 else 0.0,
        }
        for name, total, res, op in rows
    ]
