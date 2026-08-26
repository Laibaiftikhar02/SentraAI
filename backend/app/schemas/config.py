"""Pydantic schemas for Super Admin configuration endpoints (Phase 6)."""

from __future__ import annotations

from uuid import UUID
from pydantic import BaseModel, Field


# ── Department ─────────────────────────────────────────────────────────────────

class DepartmentCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    description: str | None = Field(None, max_length=5000)


class DepartmentUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=255)
    description: str | None = Field(None, max_length=5000)
    is_active: bool | None = None


class DepartmentResponse(BaseModel):
    id: UUID
    name: str
    description: str | None = None
    is_active: bool
    assigned_admins: list[dict] = []  # [{id, name}]

    model_config = {"from_attributes": True}


# ── Category ───────────────────────────────────────────────────────────────────

class CategoryCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    description: str | None = Field(None, max_length=5000)
    department_id: UUID | None = None  # Mapped department (creates routing rule)


class CategoryUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=255)
    description: str | None = Field(None, max_length=5000)
    is_active: bool | None = None
    department_id: UUID | None = None  # Update mapped department


class CategoryResponse(BaseModel):
    id: UUID
    name: str
    description: str | None = None
    is_active: bool
    mapped_department_id: UUID | None = None
    mapped_department_name: str | None = None

    model_config = {"from_attributes": True}


# ── Admin Account ──────────────────────────────────────────────────────────────

class AdminCreate(BaseModel):
    email: str = Field(..., min_length=3, max_length=255)
    name: str = Field(..., min_length=1, max_length=255)
    password: str = Field(..., min_length=8)
    department_ids: list[UUID] = Field(default_factory=list)


class AdminUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=255)
    is_active: bool | None = None
    department_ids: list[UUID] | None = None


class AdminResponse(BaseModel):
    id: UUID
    name: str
    email: str
    role: str
    is_active: bool
    departments: list[dict] = []  # [{id, name}]

    model_config = {"from_attributes": True}


# ── Campus Zone ────────────────────────────────────────────────────────────────

class ZoneCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    description: str | None = Field(None, max_length=5000)
    zone_type: str | None = Field(None, max_length=50)
    polygon_json: list[list[float]] | None = None


class ZoneUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=255)
    description: str | None = Field(None, max_length=5000)
    zone_type: str | None = Field(None, max_length=50)
    polygon_json: list[list[float]] | None = None
    is_active: bool | None = None


class ZoneResponse(BaseModel):
    id: UUID
    name: str
    description: str | None = None
    zone_type: str | None = None
    polygon_json: list[list[float]] | None = None
    is_active: bool

    model_config = {"from_attributes": True}


# ── Organization Settings ──────────────────────────────────────────────────────

class OrgSettingsUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=255)


class OrgSettingsResponse(BaseModel):
    id: UUID
    name: str
    description: str | None = None

    model_config = {"from_attributes": True}
