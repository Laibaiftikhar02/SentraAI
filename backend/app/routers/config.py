"""Super Admin configuration API endpoints (Phase 6).

All endpoints require super_admin role.
Provides CRUD for departments, categories, admin accounts, campus zones,
and organization settings — the configurability layer for Demo Scenario D.
"""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.middleware.auth import CurrentUser, require_role
from app.schemas.config import (
    AdminCreate,
    AdminResponse,
    AdminUpdate,
    CategoryCreate,
    CategoryResponse,
    CategoryUpdate,
    DepartmentCreate,
    DepartmentResponse,
    DepartmentUpdate,
    OrgSettingsResponse,
    OrgSettingsUpdate,
    ZoneCreate,
    ZoneResponse,
    ZoneUpdate,
)
from app.services import config_service

router = APIRouter(
    prefix="/api/v1/config",
    tags=["config"],
    dependencies=[Depends(require_role("super_admin"))],
)

super_admin_user = require_role("super_admin")


# ── Department Management (UDS Screen 14) ──────────────────────────────────────


@router.get("/departments", response_model=list[DepartmentResponse])
def list_departments(
    current_user: CurrentUser = Depends(super_admin_user),
    db: Session = Depends(get_db),
):
    return config_service.list_departments(db, current_user)


@router.post("/departments", response_model=DepartmentResponse, status_code=201)
def create_department(
    body: DepartmentCreate,
    current_user: CurrentUser = Depends(super_admin_user),
    db: Session = Depends(get_db),
):
    dept = config_service.create_department(
        db, current_user, body.name, body.description
    )
    # Return with empty admins (just created)
    return DepartmentResponse(
        id=dept.id,
        name=dept.name,
        description=dept.description,
        is_active=dept.is_active,
        assigned_admins=[],
    )


@router.patch("/departments/{dept_id}", response_model=DepartmentResponse)
def update_department(
    dept_id: UUID,
    body: DepartmentUpdate,
    current_user: CurrentUser = Depends(super_admin_user),
    db: Session = Depends(get_db),
):
    dept = config_service.update_department(
        db, current_user, dept_id,
        name=body.name,
        description=body.description,
        is_active=body.is_active,
    )
    # Re-fetch full response with admins
    from app.models.user import User
    from app.models.admin_department import AdminDepartment
    admins = (
        db.query(User)
        .join(AdminDepartment, AdminDepartment.user_id == User.id)
        .filter(AdminDepartment.department_id == dept.id, User.is_active.is_(True))
        .all()
    )
    return DepartmentResponse(
        id=dept.id,
        name=dept.name,
        description=dept.description,
        is_active=dept.is_active,
        assigned_admins=[{"id": str(a.id), "name": a.name} for a in admins],
    )


# ── Category Management (UDS Screen 15) ────────────────────────────────────────


@router.get("/categories", response_model=list[CategoryResponse])
def list_categories(
    current_user: CurrentUser = Depends(super_admin_user),
    db: Session = Depends(get_db),
):
    return config_service.list_categories(db, current_user)


@router.post("/categories", response_model=CategoryResponse, status_code=201)
def create_category(
    body: CategoryCreate,
    current_user: CurrentUser = Depends(super_admin_user),
    db: Session = Depends(get_db),
):
    cat = config_service.create_category(
        db, current_user, body.name, body.description, body.department_id
    )
    # Re-fetch mapped department info
    cats = config_service.list_categories(db, current_user)
    for c in cats:
        if c["id"] == str(cat.id):
            return CategoryResponse(**c)
    return CategoryResponse(
        id=cat.id, name=cat.name, description=cat.description,
        is_active=cat.is_active,
    )


@router.patch("/categories/{cat_id}", response_model=CategoryResponse)
def update_category(
    cat_id: UUID,
    body: CategoryUpdate,
    current_user: CurrentUser = Depends(super_admin_user),
    db: Session = Depends(get_db),
):
    cat = config_service.update_category(
        db, current_user, cat_id,
        name=body.name,
        description=body.description,
        is_active=body.is_active,
        department_id=body.department_id,
    )
    cats = config_service.list_categories(db, current_user)
    for c in cats:
        if c["id"] == str(cat.id):
            return CategoryResponse(**c)
    return CategoryResponse(
        id=cat.id, name=cat.name, description=cat.description,
        is_active=cat.is_active,
    )


# ── Admin Management (UDS Screen 17) ──────────────────────────────────────────


@router.get("/admins", response_model=list[AdminResponse])
def list_admins(
    current_user: CurrentUser = Depends(super_admin_user),
    db: Session = Depends(get_db),
):
    return config_service.list_admins(db, current_user)


@router.post("/admins", response_model=AdminResponse, status_code=201)
def create_admin(
    body: AdminCreate,
    current_user: CurrentUser = Depends(super_admin_user),
    db: Session = Depends(get_db),
):
    user = config_service.create_admin(
        db, current_user, body.email, body.name, body.password, body.department_ids
    )
    # Re-fetch full response with departments
    admins = config_service.list_admins(db, current_user)
    for a in admins:
        if a["id"] == str(user.id):
            return AdminResponse(**a)
    return AdminResponse(
        id=user.id, name=user.name, email=user.email,
        role=user.role, is_active=user.is_active, departments=[],
    )


@router.patch("/admins/{admin_id}", response_model=AdminResponse)
def update_admin(
    admin_id: UUID,
    body: AdminUpdate,
    current_user: CurrentUser = Depends(super_admin_user),
    db: Session = Depends(get_db),
):
    user = config_service.update_admin(
        db, current_user, admin_id,
        name=body.name,
        is_active=body.is_active,
        department_ids=body.department_ids,
    )
    admins = config_service.list_admins(db, current_user)
    for a in admins:
        if a["id"] == str(user.id):
            return AdminResponse(**a)
    return AdminResponse(
        id=user.id, name=user.name, email=user.email,
        role=user.role, is_active=user.is_active, departments=[],
    )


# ── Campus Zone Management (UDS Screen 16) ────────────────────────────────────


@router.get("/zones", response_model=list[ZoneResponse])
def list_zones(
    current_user: CurrentUser = Depends(super_admin_user),
    db: Session = Depends(get_db),
):
    zones = config_service.list_zones(db, current_user)
    return [
        ZoneResponse(
            id=z.id,
            name=z.name,
            description=z.description,
            zone_type=z.zone_type,
            polygon_json=z.polygon_json,
            is_active=z.is_active,
        )
        for z in zones
    ]


@router.post("/zones", response_model=ZoneResponse, status_code=201)
def create_zone(
    body: ZoneCreate,
    current_user: CurrentUser = Depends(super_admin_user),
    db: Session = Depends(get_db),
):
    zone = config_service.create_zone(
        db, current_user, body.name, body.description,
        body.zone_type, body.polygon_json,
    )
    return ZoneResponse(
        id=zone.id,
        name=zone.name,
        description=zone.description,
        zone_type=zone.zone_type,
        polygon_json=zone.polygon_json,
        is_active=zone.is_active,
    )


@router.patch("/zones/{zone_id}", response_model=ZoneResponse)
def update_zone(
    zone_id: UUID,
    body: ZoneUpdate,
    current_user: CurrentUser = Depends(super_admin_user),
    db: Session = Depends(get_db),
):
    zone = config_service.update_zone(
        db, current_user, zone_id,
        name=body.name,
        description=body.description,
        zone_type=body.zone_type,
        polygon_json=body.polygon_json,
        is_active=body.is_active,
    )
    return ZoneResponse(
        id=zone.id,
        name=zone.name,
        description=zone.description,
        zone_type=zone.zone_type,
        polygon_json=zone.polygon_json,
        is_active=zone.is_active,
    )


@router.delete("/zones/{zone_id}", status_code=204)
def delete_zone(
    zone_id: UUID,
    current_user: CurrentUser = Depends(super_admin_user),
    db: Session = Depends(get_db),
):
    config_service.delete_zone(db, current_user, zone_id)


# ── Organization Settings (UDS Screen 18 — Name only) ─────────────────────────


@router.get("/org", response_model=OrgSettingsResponse)
def get_org_settings(
    current_user: CurrentUser = Depends(super_admin_user),
    db: Session = Depends(get_db),
):
    org = config_service.get_org_settings(db, current_user)
    return OrgSettingsResponse(
        id=org.id, name=org.name, description=org.description
    )


@router.patch("/org", response_model=OrgSettingsResponse)
def update_org_settings(
    body: OrgSettingsUpdate,
    current_user: CurrentUser = Depends(super_admin_user),
    db: Session = Depends(get_db),
):
    org = config_service.update_org_settings(db, current_user, name=body.name)
    return OrgSettingsResponse(
        id=org.id, name=org.name, description=org.description
    )
