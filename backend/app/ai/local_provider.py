"""Rule-based local AI provider — zero-cost, deterministic triage.

Implements the AI processing pipeline using keyword matching, heuristic
rules, and Jaccard similarity for duplicate detection.  No external API
calls or paid services.

Provider can be swapped via AI_PROVIDER config (AI Contract §18).
"""

from __future__ import annotations

import re
from collections import Counter
from uuid import UUID

from app.ai.base import AIProvider, AIResult


# ── Keyword dictionaries ────────────────────────────────────────────────────

# Category keywords: exact category name → list of trigger keywords
# These are matched against the org's configured category names.
_CATEGORY_KEYWORDS: dict[str, list[str]] = {
    "Network / Internet": [
        "wifi", "internet", "network", "connection", "online", "router",
        "bandwidth", "cable", "ethernet", "dns",
    ],
    "Computer / Hardware": [
        "computer", "laptop", "desktop", "monitor", "screen", "keyboard",
        "mouse", "printer", "projector", "hardware",
    ],
    "Software / Portal": [
        "software", "portal", "website", "app", "application", "login",
        "password", "system", "error", "crash", "bug",
    ],
    "Water Supply": [
        "water", "tap", "pipe", "leak", "plumbing", "drinking",
        "sewage", "drain", "overflow", "no water",
    ],
    "Electricity / Power": [
        "electricity", "power", "light", "fan", "outage", "voltage",
        "switch", "socket", "generator", "ups",
    ],
    "Cleanliness / Sanitation": [
        "clean", "dirty", "garbage", "trash", "dustbin", "toilet",
        "bathroom", "sanitation", "hygiene", "smell", "odor",
    ],
    "Furniture / Infrastructure": [
        "furniture", "chair", "desk", "table", "bed", "mattress",
        "broken", "damage", "shelf", "door", "window",
    ],
    "Fire / Safety Emergency": [
        "fire", "emergency", "danger", "safety", "smoke", "burn",
        "evacuation", "life threatening", "hazard", "alarm",
    ],
    "Theft / Security": [
        "theft", "stolen", "robbery", "intruder", "cctv", "security",
        "threat", "assault", "harassment", "bullying", "violence",
    ],
    "Unauthorized Access": [
        "unauthorized", "trespass", "break-in", "access", "intrusion",
    ],
    "Hostel Complaint": [
        "hostel", "room", "warden", "mess", "food quality", "laundry",
        "accommodation", "roommate", "noise",
    ],
    "Academic Issue": [
        "exam", "course", "lecture", "professor", "grade", "assignment",
        "timetable", "schedule", "registration", "enrollment", "class",
    ],
    "Discipline / Conduct": [
        "discipline", "conduct", "behavior", "misconduct", "ragging",
    ],
    "Fee / Payment": [
        "bill", "fee", "payment", "charge", "invoice", "tuition",
        "overcharge", "tax",
    ],
    "Scholarship": [
        "scholarship", "financial aid", "grant", "stipend",
    ],
    "Refund": [
        "refund", "reimbursement", "money back",
    ],
}

# Urgency keywords → (priority_level, base_confidence)
_URGENCY_KEYWORDS: dict[str, list[tuple[str, float]]] = {
    "critical": [
        ("fire", 0.95), ("emergency", 0.95), ("life threatening", 0.98),
        ("danger", 0.90), ("severe injury", 0.95), ("gas leak", 0.95),
        ("collapse", 0.92), ("electrocution", 0.95), ("flooding", 0.90),
        ("assault", 0.90), ("intruder", 0.90),
    ],
    "high": [
        ("broken", 0.75), ("leak", 0.72), ("not working", 0.70),
        ("urgent", 0.80), ("critical", 0.78), ("power outage", 0.80),
        ("no water", 0.78), ("theft", 0.80), ("harassment", 0.82),
        ("overflowing", 0.75), ("blocked", 0.70),
    ],
    "medium": [
        ("slow", 0.55), ("issue", 0.50), ("problem", 0.50),
        ("inconvenience", 0.45), ("dirty", 0.50), ("noisy", 0.48),
        ("delay", 0.50), ("repair", 0.55), ("damage", 0.58),
        ("error", 0.52), ("complaint", 0.45),
    ],
    "low": [
        ("suggestion", 0.40), ("minor", 0.35), ("would be nice", 0.30),
        ("small", 0.30), ("cosmetic", 0.28), ("request", 0.35),
        ("wish", 0.28), ("improvement", 0.32),
    ],
}

# Minimum routing confidence for automatic queue placement
_ROUTING_CONFIDENCE_THRESHOLD = 0.50

# Minimum Jaccard similarity for duplicate detection
_DUPLICATE_SIMILARITY_THRESHOLD = 0.30


# ── Utility helpers ─────────────────────────────────────────────────────────

def _tokenize(text: str) -> set[str]:
    """Lowercase, split, and strip punctuation from text."""
    return set(re.findall(r"[a-z]+", text.lower()))


def _jaccard_similarity(set_a: set[str], set_b: set[str]) -> float:
    """Compute Jaccard similarity between two word sets."""
    if not set_a or not set_b:
        return 0.0
    intersection = set_a & set_b
    union = set_a | set_b
    return len(intersection) / len(union)


def _find_matching_category(
    text: str, categories: list[dict]
) -> tuple[str | None, float | None, list[str]]:
    """Match complaint text to the best configured category by keyword overlap.

    Returns (category_name, confidence, matched_keywords).
    """
    text_lower = text.lower()
    best_name: str | None = None
    best_score = 0.0
    best_keywords: list[str] = []

    for cat in categories:
        cat_name = cat["name"]
        matched: list[str] = []

        # 1. Check if complaint text mentions the category name itself
        if cat_name.lower() in text_lower:
            matched.append(cat_name)

        # 2. Check keyword dictionary for this exact category name
        keywords = _CATEGORY_KEYWORDS.get(cat_name, [])
        for kw in keywords:
            if kw in text_lower:
                matched.append(kw)

        if matched:
            # Score = number of keyword matches (capped, normalized)
            score = min(len(matched) / 3.0, 1.0)
            if score > best_score:
                best_score = score
                best_name = cat_name
                best_keywords = matched

    if best_name is None:
        return None, None, []

    # Confidence: bounded between 0.4 and 0.95
    confidence = max(0.40, min(0.95, best_score))
    return best_name, confidence, best_keywords


def _assess_urgency(
    text: str,
) -> tuple[str | None, float | None, list[str]]:
    """Assess urgency from complaint text using keyword matching.

    Handles basic negation: "not urgent" / "not critical" won't trigger
    high-urgency signals.

    Returns (priority_level, confidence, signal_keywords).
    """
    text_lower = text.lower()

    # Neutralize negated urgency keywords so they don't false-match
    negated = text_lower
    for neg_phrase in [
        "not urgent", "not critical", "not an emergency", "not dangerous",
        "not a threat", "not life threatening", "not serious",
        "is not urgent", "is not critical", "is not an emergency",
    ]:
        negated = negated.replace(neg_phrase, "low_severity_negated")

    best_level: str | None = None
    best_confidence = 0.0
    signals: list[str] = []

    for level, keyword_list in _URGENCY_KEYWORDS.items():
        for kw, conf in keyword_list:
            if kw in negated:
                signals.append(kw)
                if conf > best_confidence:
                    best_confidence = conf
                    best_level = level

    if best_level is None:
        # Default to "medium" when no urgency signals found
        return "medium", 0.40, ["no strong urgency signals detected"]

    return best_level, best_confidence, signals


def _detect_duplicate(
    title: str,
    description: str,
    existing_complaints: list[dict] | None,
) -> tuple[bool, UUID | None, float]:
    """Check for near-duplicate complaints using Jaccard similarity.

    Returns (duplicate_detected, cluster_id_or_none, max_similarity).
    """
    if not existing_complaints:
        return False, None, 0.0

    new_tokens = _tokenize(title + " " + description)
    if len(new_tokens) < 3:
        # Too short to reliably compare
        return False, None, 0.0

    max_sim = 0.0
    best_cluster_id: UUID | None = None
    duplicate_found = False

    for existing in existing_complaints:
        existing_tokens = _tokenize(
            existing.get("title", "") + " " + existing.get("description", "")
        )
        sim = _jaccard_similarity(new_tokens, existing_tokens)

        if sim >= _DUPLICATE_SIMILARITY_THRESHOLD and sim > max_sim:
            max_sim = sim
            duplicate_found = True
            # If the existing complaint belongs to a cluster, reuse it
            best_cluster_id = existing.get("duplicate_cluster_id")

    return duplicate_found, best_cluster_id, max_sim


def _resolve_department(
    category_name: str | None,
    routing_rules: list[dict],
    departments: list[dict],
) -> tuple[str | None, float]:
    """Map AI category to a department via routing rules.

    Returns (department_name, routing_confidence).
    Low confidence or no match → (None, low_value) → General Review.
    """
    if not category_name or not routing_rules:
        return None, 0.20

    cat_lower = category_name.lower()

    # Find routing rules whose category matches the AI category
    for rule in routing_rules:
        rule_cat = rule.get("category_name", "")
        if rule_cat.lower() == cat_lower:
            dept_name = rule.get("department_name")
            # Validate department exists in configured departments
            for dept in departments:
                if dept["name"].lower() == dept_name.lower():
                    return dept_name, 0.80

    # No routing rule matched — try department name overlap with category
    for dept in departments:
        dept_lower = dept["name"].lower()
        if cat_lower in dept_lower or dept_lower in cat_lower:
            return dept["name"], 0.55

    # No match at all → General Review
    return None, 0.20


# ── Local AI Provider ──────────────────────────────────────────────────────

class LocalAIProvider(AIProvider):
    """Zero-cost rule-based AI provider for the hackathon MVP.

    Uses keyword matching and simple text similarity.  Deterministic,
    fast, and requires no external services.
    """

    model_name = "local-rule-based-v1"
    provider_name = "local"

    def analyze_complaint(
        self,
        *,
        title: str,
        description: str,
        categories: list[dict],
        departments: list[dict],
        routing_rules: list[dict],
        priority_rules: list[dict],
        zone_name: str | None = None,
        existing_complaints: list[dict] | None = None,
    ) -> AIResult:

        combined_text = f"{title}. {description}"
        explanation: dict = {}

        # 1. Summarization — extract first ~200 chars of description
        summary = description[:200].strip()
        if len(description) > 200:
            summary += "..."

        # 2. Category classification
        cat_name, cat_confidence, cat_keywords = _find_matching_category(
            combined_text, categories
        )
        explanation["category_signals"] = cat_keywords if cat_keywords else None

        # 3. Urgency assessment
        priority, priority_confidence, urgency_signals = _assess_urgency(
            combined_text
        )

        # Check priority_rules: if a configured rule exists for the matched
        # category and suggests a higher priority, use that
        if cat_name and priority_rules:
            for pr in priority_rules:
                if (
                    pr.get("category_name", "").lower() == (cat_name or "").lower()
                    and pr.get("priority_level")
                ):
                    rule_priority = pr["priority_level"]
                    priority_order = {"critical": 4, "high": 3, "medium": 2, "low": 1}
                    if priority_order.get(rule_priority, 0) > priority_order.get(
                        priority or "medium", 0
                    ):
                        priority = rule_priority
                        priority_confidence = max(
                            priority_confidence or 0.5, 0.65
                        )
                        urgency_signals.append(
                            f"elevated by priority rule for {cat_name}"
                        )

        priority_rationale = ", ".join(urgency_signals) if urgency_signals else None
        explanation["urgency_signals"] = urgency_signals

        # 4. Duplicate detection
        dup_detected, dup_cluster_id, dup_similarity = _detect_duplicate(
            title, description, existing_complaints
        )
        explanation["duplicate_similarity"] = round(dup_similarity, 3) if dup_similarity else None

        # 5. Department routing
        dept_name, routing_confidence = _resolve_department(
            cat_name, routing_rules, departments
        )
        explanation["routing_note"] = (
            f"Mapped category '{cat_name}' to department '{dept_name}'"
            if dept_name
            else f"No confident route for category '{cat_name}' — General Review"
        )

        # 6. Overall confidence — weighted average
        confidences = [
            c for c in [cat_confidence, priority_confidence, routing_confidence]
            if c is not None
        ]
        overall_confidence = (
            sum(confidences) / len(confidences) if confidences else None
        )

        # 7. Manual review flag
        needs_manual_review = (
            cat_name is None
            or dept_name is None
            or (routing_confidence or 0) < _ROUTING_CONFIDENCE_THRESHOLD
            or (cat_confidence or 0) < 0.50
        )

        return AIResult(
            summary=summary,
            category=cat_name,
            category_confidence=cat_confidence,
            priority=priority,
            priority_confidence=priority_confidence,
            priority_rationale=priority_rationale,
            department=dept_name,
            routing_confidence=routing_confidence,
            duplicate_detected=dup_detected,
            duplicate_cluster_id=dup_cluster_id,
            duplicate_similarity=dup_similarity,
            confidence=overall_confidence,
            needs_manual_review=needs_manual_review,
            explanation=explanation,
        )
