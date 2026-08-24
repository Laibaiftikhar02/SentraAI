"""Abstract AI provider interface and structured result types.

The provider-agnostic boundary (AI Contract §18) ensures the underlying
AI model/provider can be swapped without rewriting business logic.
All providers implement this interface and return the same AIResult structure.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from uuid import UUID


@dataclass
class AIResult:
    """Structured AI analysis result aligned to AI Contract §10.

    All fields are optional / nullable — the AI may not be able to
    determine every attribute for every complaint.
    """

    # Administrator-facing concise summary (never replaces original)
    summary: str | None = None

    # Category classification — name string; validated against org config later
    category: str | None = None
    category_confidence: float | None = None

    # Urgency / priority recommendation — one of: critical, high, medium, low
    priority: str | None = None
    priority_confidence: float | None = None
    priority_rationale: str | None = None

    # Department routing recommendation — name string; validated later
    department: str | None = None
    routing_confidence: float | None = None

    # Duplicate detection
    duplicate_detected: bool = False
    duplicate_cluster_id: UUID | None = None
    duplicate_similarity: float | None = None

    # Confidence & manual review
    confidence: float | None = None
    needs_manual_review: bool = False

    # Explainability signals (AI Contract §13)
    explanation: dict | None = field(default_factory=dict)


class AIProvider(ABC):
    """Abstract base class for all AI providers.

    Implementations must be provider-agnostic — business rules belong
    in the processing service, not inside provider-specific code.
    """

    @abstractmethod
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
        """Run the full AI triage pipeline on a complaint.

        Parameters
        ----------
        title : str
            Original complaint title.
        description : str
            Original complaint description.
        categories : list[dict]
            Configured org categories: [{"id": UUID, "name": str, "description": str}]
        departments : list[dict]
            Configured org departments: [{"id": UUID, "name": str}]
        routing_rules : list[dict]
            Active routing rules: [{"category_id": UUID, "department_id": UUID, "department_name": str}]
        priority_rules : list[dict]
            Org priority rules: [{"category_id": UUID, "priority_level": str, "weight": int}]
        zone_name : str | None
            Campus zone name if available.
        existing_complaints : list[dict] | None
            Recent same-org complaints for duplicate detection:
            [{"id": UUID, "title": str, "description": str, "duplicate_cluster_id": UUID | None}]

        Returns
        -------
        AIResult
            Structured analysis result.
        """
        ...
