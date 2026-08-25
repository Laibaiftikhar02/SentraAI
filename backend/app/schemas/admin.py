"""Pydantic schemas for admin complaint management."""

from __future__ import annotations

from uuid import UUID
from pydantic import BaseModel, Field


# ── Admin complaint update ────────────────────────────────────────────────────

class AdminUpdateComplaint(BaseModel):
    """Fields an admin can modify on a complaint.

    All fields are optional — only provided fields are applied.
    Each update creates a history entry and audit log.
    """
    # Accept / override AI suggestions
    category_id: UUID | None = None
    priority: str | None = Field(None, pattern="^(critical|high|medium|low)$")
    department_id: UUID | None = None

    # Lifecycle
    status: str | None = Field(
        None,
        pattern="^(assigned|in_progress|resolved|closed|reopened)$",
    )

    # Internal note (admin-only, appended to history)
    note: str | None = Field(None, max_length=5_000)

    # Response to the submitter
    response: str | None = Field(None, max_length=10_000)

    # Reassignment to another admin (user_id of the target admin)
    assign_to_user_id: UUID | None = None


# ── Notification ──────────────────────────────────────────────────────────────

class NotificationResponse(BaseModel):
    id: UUID
    type: str
    message: str
    is_read: bool
    complaint_id: UUID | None = None
    created_at: str

    model_config = {"from_attributes": True}


# ── Duplicate Cluster detail ──────────────────────────────────────────────────

class ClusterComplaintItem(BaseModel):
    id: UUID
    title: str
    status: str
    priority: str | None = None
    created_at: str

    model_config = {"from_attributes": True}


class DuplicateClusterResponse(BaseModel):
    id: UUID
    summary: str | None = None
    member_count: int = 0
    members: list[ClusterComplaintItem] = []
