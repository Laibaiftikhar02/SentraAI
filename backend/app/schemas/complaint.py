"""Pydantic schemas for complaint CRUD and attachments."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


# ── Create ───────────────────────────────────────────────────────────────────

class CreateComplaintFields(BaseModel):
    """Validated form fields (parsed from multipart form data)."""
    title: str = Field(min_length=1, max_length=500)
    description: str = Field(min_length=1, max_length=10_000)
    zone_id: UUID | None = None
    category_id: UUID | None = None


# ── Attachment ────────────────────────────────────────────────────────────────

class AttachmentResponse(BaseModel):
    id: UUID
    original_filename: str
    file_type: str
    file_size: int
    created_at: datetime

    model_config = {"from_attributes": True}


# ── AI Prediction (read-only subset) ─────────────────────────────────────────

class AIPredictionResponse(BaseModel):
    summary: str | None = None
    category: str | None = None
    category_confidence: float | None = None
    priority: str | None = None
    priority_confidence: float | None = None
    priority_rationale: str | None = None
    department: str | None = None
    routing_confidence: float | None = None
    duplicate_detected: bool = False
    duplicate_cluster_id: UUID | None = None
    needs_manual_review: bool = False
    provider: str | None = None

    model_config = {"from_attributes": True}


# ── Complaint Detail ──────────────────────────────────────────────────────────

class ComplaintDetailResponse(BaseModel):
    id: UUID
    title: str
    description: str
    status: str
    priority: str | None = None
    ai_status: str | None = None
    organization_id: UUID
    user_id: UUID
    department_id: UUID | None = None
    zone_id: UUID | None = None
    category_id: UUID | None = None
    duplicate_cluster_id: UUID | None = None
    created_at: datetime
    updated_at: datetime

    # Denormalized reference names (nullable)
    department_name: str | None = None
    zone_name: str | None = None
    category_name: str | None = None
    submitter_name: str | None = None

    attachments: list[AttachmentResponse] = []
    ai_prediction: AIPredictionResponse | None = None

    model_config = {"from_attributes": True}


# ── Complaint List Item ───────────────────────────────────────────────────────

class ComplaintListItem(BaseModel):
    id: UUID
    title: str
    status: str
    priority: str | None = None
    ai_status: str | None = None
    category_name: str | None = None
    department_name: str | None = None
    zone_name: str | None = None
    ai_summary: str | None = None
    assigned_admin: str | None = None
    created_at: datetime
    updated_at: datetime
    attachment_count: int = 0

    model_config = {"from_attributes": True}


# ── Paginated List ────────────────────────────────────────────────────────────

class ComplaintListResponse(BaseModel):
    items: list[ComplaintListItem]
    total: int
    page: int
    per_page: int


# ── History ───────────────────────────────────────────────────────────────────

class HistoryEntryResponse(BaseModel):
    id: UUID
    action: str
    previous_value: str | None = None
    new_value: str | None = None
    actor_id: UUID | None = None
    metadata_json: dict | None = None
    created_at: datetime

    model_config = {"from_attributes": True}
