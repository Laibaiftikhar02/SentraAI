"""AI processing service — orchestration, validation, persistence.

Responsibilities:
1. Gather org context (categories, departments, routing/priority rules).
2. Call the AI provider to analyse the complaint.
3. Validate AI output against the organisation's configured data.
4. Persist the AIPrediction (separate from authoritative complaint data).
5. Apply routing decisions to the complaint (department, priority).
6. Handle all failure modes gracefully (AI Contract §14).

Original complaint data is NEVER overwritten by AI output (AI Contract §11).
"""

from __future__ import annotations

import logging
from uuid import UUID

from sqlalchemy.orm import Session

from app.ai import get_ai_provider
from app.ai.base import AIResult
from app.config import get_settings
from app.models.ai_prediction import AIPrediction
from app.models.campus_zone import CampusZone
from app.models.category import Category
from app.models.complaint import Complaint
from app.models.complaint_history import ComplaintHistory
from app.models.department import Department
from app.models.duplicate_cluster import DuplicateCluster
from app.models.priority_rule import PriorityRule
from app.models.routing_rule import RoutingRule

logger = logging.getLogger(__name__)


# ── Public entry point ──────────────────────────────────────────────────────

def process_complaint_ai(db: Session, complaint: Complaint) -> None:
    """Run the full AI triage pipeline on a persisted complaint.

    This function is called AFTER the complaint has been committed to the
    database.  If AI processing fails for any reason, the complaint
    remains intact and ai_status is set to 'unavailable'.
    """
    settings = get_settings()
    provider = get_ai_provider(settings)

    try:
        # Mark as pending
        complaint.ai_status = "pending"
        db.commit()

        # 1. Gather organisation context
        context = _gather_org_context(db, complaint)

        # 2. Call the AI provider
        result: AIResult = provider.analyze_complaint(
            title=complaint.title,
            description=complaint.description,
            categories=context["categories"],
            departments=context["departments"],
            routing_rules=context["routing_rules"],
            priority_rules=context["priority_rules"],
            zone_name=context["zone_name"],
            existing_complaints=context["existing_complaints"],
        )

        # 3. Validate AI output against org config
        validated = _validate_ai_output(db, result, complaint)

        # 4. Persist AIPrediction
        prediction = AIPrediction(
            complaint_id=complaint.id,
            summary=validated.summary,
            category=validated.category,
            category_confidence=validated.category_confidence,
            priority=validated.priority,
            priority_confidence=validated.priority_confidence,
            priority_rationale=validated.priority_rationale,
            department=validated.department,
            routing_confidence=validated.routing_confidence,
            duplicate_detected=validated.duplicate_detected,
            duplicate_cluster_id=validated.duplicate_cluster_id,
            needs_manual_review=validated.needs_manual_review,
            explanation_json=validated.explanation,
            model_name=getattr(provider, "model_name", None),
            provider=getattr(provider, "provider_name", None),
        )
        db.add(prediction)

        # 5. Apply routing to complaint
        _apply_routing(db, complaint, validated)

        # 6. Handle duplicate cluster
        if validated.duplicate_detected:
            _handle_duplicate_cluster(db, complaint, validated)

        # 7. Update complaint status
        complaint.ai_status = "completed"

        # 8. Append history entry
        history = ComplaintHistory(
            complaint_id=complaint.id,
            action="ai_processed",
            previous_value=None,
            new_value=validated.priority or "medium",
            metadata_json={
                "ai_category": validated.category,
                "ai_priority": validated.priority,
                "ai_department": validated.department,
                "needs_manual_review": validated.needs_manual_review,
                "duplicate_detected": validated.duplicate_detected,
                "confidence": validated.confidence,
            },
        )
        db.add(history)
        db.commit()

    except Exception as exc:
        logger.error("AI processing failed for complaint %s: %s", complaint.id, exc)
        try:
            db.rollback()
            complaint.ai_status = "unavailable"
            db.commit()
        except Exception as rollback_exc:
            logger.error(
                "Failed to mark AI status as unavailable: %s", rollback_exc
            )
            try:
                db.rollback()
            except Exception:
                pass


# ── Context gathering ───────────────────────────────────────────────────────

def _gather_org_context(db: Session, complaint: Complaint) -> dict:
    """Build the context payload for the AI provider."""
    org_id = complaint.organization_id

    # Categories
    cats = (
        db.query(Category)
        .filter(Category.organization_id == org_id, Category.is_active.is_(True))
        .all()
    )
    categories = [
        {"id": c.id, "name": c.name, "description": c.description or ""}
        for c in cats
    ]

    # Departments
    depts = (
        db.query(Department)
        .filter(Department.organization_id == org_id, Department.is_active.is_(True))
        .all()
    )
    departments = [{"id": d.id, "name": d.name} for d in depts]

    # Routing rules
    rules = (
        db.query(RoutingRule)
        .filter(RoutingRule.organization_id == org_id, RoutingRule.is_active.is_(True))
        .all()
    )
    routing_rules = []
    for r in rules:
        cat_obj = db.query(Category).filter(Category.id == r.category_id).first()
        dept_obj = db.query(Department).filter(Department.id == r.department_id).first()
        routing_rules.append({
            "category_id": r.category_id,
            "category_name": cat_obj.name if cat_obj else "",
            "department_id": r.department_id,
            "department_name": dept_obj.name if dept_obj else "",
        })

    # Priority rules
    p_rules = (
        db.query(PriorityRule)
        .filter(PriorityRule.organization_id == org_id)
        .all()
    )
    priority_rules = []
    for pr in p_rules:
        cat_obj = db.query(Category).filter(Category.id == pr.category_id).first()
        priority_rules.append({
            "category_id": pr.category_id,
            "category_name": cat_obj.name if cat_obj else "",
            "priority_level": pr.priority_level,
            "weight": pr.weight or 0,
        })

    # Zone name
    zone_name = None
    if complaint.zone_id:
        zone = db.query(CampusZone).filter(CampusZone.id == complaint.zone_id).first()
        if zone:
            zone_name = zone.name

    # Existing complaints for duplicate detection (last 100 from same org)
    existing = (
        db.query(Complaint)
        .filter(
            Complaint.organization_id == org_id,
            Complaint.id != complaint.id,
        )
        .order_by(Complaint.created_at.desc())
        .limit(100)
        .all()
    )
    existing_complaints = [
        {
            "id": c.id,
            "title": c.title,
            "description": c.description,
            "duplicate_cluster_id": c.duplicate_cluster_id,
        }
        for c in existing
    ]

    return {
        "categories": categories,
        "departments": departments,
        "routing_rules": routing_rules,
        "priority_rules": priority_rules,
        "zone_name": zone_name,
        "existing_complaints": existing_complaints,
    }


# ── Validation ──────────────────────────────────────────────────────────────

_VALID_PRIORITIES = {"critical", "high", "medium", "low"}


def _validate_ai_output(
    db: Session, result: AIResult, complaint: Complaint
) -> AIResult:
    """Validate AI output against organisation configuration.

    Invalid or unknown values are set to None / safe defaults.
    AI output is treated as untrusted input until validated (AI Contract §16).
    """
    org_id = complaint.organization_id

    # Validate category — must be a configured active category
    if result.category:
        cat = (
            db.query(Category)
            .filter(
                Category.organization_id == org_id,
                Category.is_active.is_(True),
                Category.name == result.category,
            )
            .first()
        )
        if not cat:
            result.category = None
            result.category_confidence = None

    # Validate priority — must be one of the allowed values
    if result.priority and result.priority not in _VALID_PRIORITIES:
        result.priority = None
        result.priority_confidence = None

    # Validate department — must be a configured active department
    if result.department:
        dept = (
            db.query(Department)
            .filter(
                Department.organization_id == org_id,
                Department.is_active.is_(True),
                Department.name == result.department,
            )
            .first()
        )
        if not dept:
            result.department = None
            result.routing_confidence = 0.10
            result.needs_manual_review = True

    # Clamp confidence values to [0, 1]
    for attr in ("category_confidence", "priority_confidence", "routing_confidence", "confidence"):
        val = getattr(result, attr, None)
        if val is not None:
            setattr(result, attr, max(0.0, min(1.0, val)))

    return result


# ── Routing / Bidding ───────────────────────────────────────────────────────

def _apply_routing(
    db: Session, complaint: Complaint, result: AIResult
) -> None:
    """Apply AI routing decisions to the complaint.

    High-confidence + valid department → automatic queue placement.
    Low-confidence or no department → General Review (department_id stays None).
    AI priority is applied as the complaint's initial priority.
    """
    # Apply priority (initial value — admin can change later)
    if result.priority:
        complaint.priority = result.priority

    # Apply department routing
    if result.department and (result.routing_confidence or 0) >= 0.50:
        dept = (
            db.query(Department)
            .filter(
                Department.organization_id == complaint.organization_id,
                Department.is_active.is_(True),
                Department.name == result.department,
            )
            .first()
        )
        if dept:
            complaint.department_id = dept.id
            # Transition status to "assigned" when routed
            if complaint.status == "created":
                complaint.status = "assigned"


# ── Duplicate handling ──────────────────────────────────────────────────────

def _handle_duplicate_cluster(
    db: Session, complaint: Complaint, result: AIResult
) -> None:
    """Associate the complaint with a DuplicateCluster.

    If an existing cluster was found, link to it.
    Otherwise, create a new cluster for this issue.
    Original complaints are NEVER deleted (PMD v2.2 / AI Contract §12).
    """
    if result.duplicate_cluster_id:
        # Link to existing cluster
        cluster = (
            db.query(DuplicateCluster)
            .filter(DuplicateCluster.id == result.duplicate_cluster_id)
            .first()
        )
        if cluster:
            complaint.duplicate_cluster_id = cluster.id
            return

    # Create a new cluster
    cluster = DuplicateCluster(
        organization_id=complaint.organization_id,
        summary=complaint.title[:200],
    )
    db.add(cluster)
    db.flush()
    complaint.duplicate_cluster_id = cluster.id
