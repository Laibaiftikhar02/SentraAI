"""Super Admin configuration service — CRUD logic for departments, categories,
admin accounts, campus zones, and organization settings (Phase 6)."""

from __future__ import annotations

from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.middleware.auth import CurrentUser
from app.models.department import Department
from app.models.category import Category
from app.models.user import User
from app.models.admin_department import AdminDepartment
from app.models.campus_zone import CampusZone
from app.models.organization import Organization
from app.models.routing_rule import RoutingRule
from app.models.complaint import Complaint
from app.services.auth_service import hash_password


# ════════════════════════════════════════════════════════════════════════════════
# Department Management
# ════════════════════════════════════════════════════════════════════════════════


def list_departments(db: Session, current_user: CurrentUser) -> list[dict]:
    """Return all departments in the organization with assigned admins."""
    depts = (
        db.query(Department)
        .filter(Department.organization_id == current_user.organization_id)
        .order_by(Department.name)
        .all()
    )
    result = []
    for d in depts:
        admins = (
            db.query(User)
            .join(AdminDepartment, AdminDepartment.user_id == User.id)
            .filter(
                AdminDepartment.department_id == d.id,
                User.is_active.is_(True),
            )
            .all()
        )
        result.append(
            {
                "id": str(d.id),
                "name": d.name,
                "description": d.description,
                "is_active": d.is_active,
                "assigned_admins": [
                    {"id": str(a.id), "name": a.name} for a in admins
                ],
            }
        )
    return result


def create_department(
    db: Session, current_user: CurrentUser, name: str, description: str | None
) -> Department:
    # Check for duplicate name
    existing = (
        db.query(Department)
        .filter(
            Department.organization_id == current_user.organization_id,
            Department.name.ilike(name),
        )
        .first()
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Department '{name}' already exists",
        )
    dept = Department(
        organization_id=current_user.organization_id,
        name=name,
        description=description,
    )
    db.add(dept)
    db.commit()
    db.refresh(dept)
    return dept


def update_department(
    db: Session,
    current_user: CurrentUser,
    dept_id: UUID,
    name: str | None = None,
    description: str | None = None,
    is_active: bool | None = None,
) -> Department:
    dept = (
        db.query(Department)
        .filter(
            Department.id == dept_id,
            Department.organization_id == current_user.organization_id,
        )
        .first()
    )
    if not dept:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Department not found"
        )
    if name is not None:
        # Check duplicate name (excluding self)
        dup = (
            db.query(Department)
            .filter(
                Department.organization_id == current_user.organization_id,
                Department.name.ilike(name),
                Department.id != dept_id,
            )
            .first()
        )
        if dup:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Department '{name}' already exists",
            )
        dept.name = name
    if description is not None:
        dept.description = description
    if is_active is not None:
        dept.is_active = is_active
    db.commit()
    db.refresh(dept)
    return dept


# ════════════════════════════════════════════════════════════════════════════════
# Category Management
# ════════════════════════════════════════════════════════════════════════════════


def list_categories(db: Session, current_user: CurrentUser) -> list[dict]:
    """Return all categories with their mapped department (via routing rule)."""
    cats = (
        db.query(Category)
        .filter(Category.organization_id == current_user.organization_id)
        .order_by(Category.name)
        .all()
    )
    cat_ids = [c.id for c in cats]

    # Fetch routing rules for mapped departments
    dept_map: dict[str, dict] = {}
    if cat_ids:
        rules = (
            db.query(RoutingRule)
            .join(Department, Department.id == RoutingRule.department_id)
            .filter(
                RoutingRule.category_id.in_(cat_ids),
                RoutingRule.is_active.is_(True),
            )
            .all()
        )
        for r in rules:
            dept_map[str(r.category_id)] = {
                "id": str(r.department_id),
                "name": r.department.name if r.department else None,
            }

    result = []
    for c in cats:
        mapping = dept_map.get(str(c.id))
        result.append(
            {
                "id": str(c.id),
                "name": c.name,
                "description": c.description,
                "is_active": c.is_active,
                "mapped_department_id": mapping["id"] if mapping else None,
                "mapped_department_name": mapping["name"] if mapping else None,
            }
        )
    return result


def create_category(
    db: Session,
    current_user: CurrentUser,
    name: str,
    description: str | None,
    department_id: UUID | None,
) -> Category:
    # Check duplicate name
    existing = (
        db.query(Category)
        .filter(
            Category.organization_id == current_user.organization_id,
            Category.name.ilike(name),
        )
        .first()
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Category '{name}' already exists",
        )
    cat = Category(
        organization_id=current_user.organization_id,
        name=name,
        description=description,
    )
    db.add(cat)
    db.flush()

    # Create routing rule if department specified
    if department_id:
        _ensure_department_exists(db, department_id, current_user.organization_id)
        rule = RoutingRule(
            organization_id=current_user.organization_id,
            category_id=cat.id,
            department_id=department_id,
            created_by=current_user.user_id,
        )
        db.add(rule)

    db.commit()
    db.refresh(cat)
    return cat


def update_category(
    db: Session,
    current_user: CurrentUser,
    cat_id: UUID,
    name: str | None = None,
    description: str | None = None,
    is_active: bool | None = None,
    department_id: UUID | None = None,
) -> Category:
    cat = (
        db.query(Category)
        .filter(
            Category.id == cat_id,
            Category.organization_id == current_user.organization_id,
        )
        .first()
    )
    if not cat:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Category not found"
        )
    if name is not None:
        dup = (
            db.query(Category)
            .filter(
                Category.organization_id == current_user.organization_id,
                Category.name.ilike(name),
                Category.id != cat_id,
            )
            .first()
        )
        if dup:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Category '{name}' already exists",
            )
        cat.name = name
    if description is not None:
        cat.description = description
    if is_active is not None:
        cat.is_active = is_active

    # Update routing rule if department specified
    if department_id is not None:
        _ensure_department_exists(db, department_id, current_user.organization_id)
        existing_rule = (
            db.query(RoutingRule)
            .filter(
                RoutingRule.category_id == cat_id,
                RoutingRule.is_active.is_(True),
            )
            .first()
        )
        if existing_rule:
            existing_rule.department_id = department_id
        else:
            rule = RoutingRule(
                organization_id=current_user.organization_id,
                category_id=cat_id,
                department_id=department_id,
                created_by=current_user.user_id,
            )
            db.add(rule)

    db.commit()
    db.refresh(cat)
    return cat


def _ensure_department_exists(db: Session, dept_id: UUID, org_id: UUID) -> None:
    dept = (
        db.query(Department)
        .filter(Department.id == dept_id, Department.organization_id == org_id)
        .first()
    )
    if not dept:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Department not found in this organization",
        )


# ════════════════════════════════════════════════════════════════════════════════
# Admin Account Management
# ════════════════════════════════════════════════════════════════════════════════


def list_admins(db: Session, current_user: CurrentUser) -> list[dict]:
    """Return all admin users in the organization with their department assignments."""
    admins = (
        db.query(User)
        .filter(
            User.organization_id == current_user.organization_id,
            User.role == "admin",
        )
        .order_by(User.name)
        .all()
    )
    result = []
    for a in admins:
        depts = (
            db.query(Department)
            .join(AdminDepartment, AdminDepartment.department_id == Department.id)
            .filter(AdminDepartment.user_id == a.id)
            .all()
        )
        result.append(
            {
                "id": str(a.id),
                "name": a.name,
                "email": a.email,
                "role": a.role,
                "is_active": a.is_active,
                "departments": [
                    {"id": str(d.id), "name": d.name} for d in depts
                ],
            }
        )
    return result


def create_admin(
    db: Session,
    current_user: CurrentUser,
    email: str,
    name: str,
    password: str,
    department_ids: list[UUID],
) -> User:
    # Check duplicate email
    existing = db.query(User).filter(User.email == email).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email already registered",
        )
    user = User(
        organization_id=current_user.organization_id,
        email=email,
        name=name,
        password_hash=hash_password(password),
        role="admin",
    )
    db.add(user)
    db.flush()

    # Assign departments
    for dept_id in department_ids:
        _ensure_department_exists(db, dept_id, current_user.organization_id)
        assignment = AdminDepartment(user_id=user.id, department_id=dept_id)
        db.add(assignment)

    db.commit()
    db.refresh(user)
    return user


def update_admin(
    db: Session,
    current_user: CurrentUser,
    admin_id: UUID,
    name: str | None = None,
    is_active: bool | None = None,
    department_ids: list[UUID] | None = None,
) -> User:
    user = (
        db.query(User)
        .filter(
            User.id == admin_id,
            User.organization_id == current_user.organization_id,
            User.role == "admin",
        )
        .first()
    )
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Admin not found"
        )
    if name is not None:
        user.name = name
    if is_active is not None:
        user.is_active = is_active

    # Replace department assignments if provided
    if department_ids is not None:
        db.query(AdminDepartment).filter(AdminDepartment.user_id == admin_id).delete()
        for dept_id in department_ids:
            _ensure_department_exists(db, dept_id, current_user.organization_id)
            assignment = AdminDepartment(user_id=user.id, department_id=dept_id)
            db.add(assignment)

    db.commit()
    db.refresh(user)
    return user


# ════════════════════════════════════════════════════════════════════════════════
# Campus Zone Management
# ════════════════════════════════════════════════════════════════════════════════


def list_zones(db: Session, current_user: CurrentUser) -> list[CampusZone]:
    return (
        db.query(CampusZone)
        .filter(CampusZone.organization_id == current_user.organization_id)
        .order_by(CampusZone.name)
        .all()
    )


def create_zone(
    db: Session,
    current_user: CurrentUser,
    name: str,
    description: str | None,
    zone_type: str | None,
    polygon_json: list | None,
) -> CampusZone:
    # Check duplicate name
    existing = (
        db.query(CampusZone)
        .filter(
            CampusZone.organization_id == current_user.organization_id,
            CampusZone.name.ilike(name),
        )
        .first()
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Zone '{name}' already exists",
        )
    zone = CampusZone(
        organization_id=current_user.organization_id,
        name=name,
        description=description,
        zone_type=zone_type,
        polygon_json=polygon_json,
    )
    db.add(zone)
    db.commit()
    db.refresh(zone)
    return zone


def update_zone(
    db: Session,
    current_user: CurrentUser,
    zone_id: UUID,
    name: str | None = None,
    description: str | None = None,
    zone_type: str | None = None,
    polygon_json: list | None = None,
    is_active: bool | None = None,
) -> CampusZone:
    zone = (
        db.query(CampusZone)
        .filter(
            CampusZone.id == zone_id,
            CampusZone.organization_id == current_user.organization_id,
        )
        .first()
    )
    if not zone:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Zone not found"
        )
    if name is not None:
        dup = (
            db.query(CampusZone)
            .filter(
                CampusZone.organization_id == current_user.organization_id,
                CampusZone.name.ilike(name),
                CampusZone.id != zone_id,
            )
            .first()
        )
        if dup:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Zone '{name}' already exists",
            )
        zone.name = name
    if description is not None:
        zone.description = description
    if zone_type is not None:
        zone.zone_type = zone_type
    if polygon_json is not None:
        zone.polygon_json = polygon_json
    if is_active is not None:
        zone.is_active = is_active
    db.commit()
    db.refresh(zone)
    return zone


def delete_zone(db: Session, current_user: CurrentUser, zone_id: UUID) -> None:
    """Delete a campus zone (UDS Screen 16 allows Delete)."""
    zone = (
        db.query(CampusZone)
        .filter(
            CampusZone.id == zone_id,
            CampusZone.organization_id == current_user.organization_id,
        )
        .first()
    )
    if not zone:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Zone not found"
        )
    # Check if zone has complaints
    complaint_count = (
        db.query(Complaint)
        .filter(Complaint.zone_id == zone_id)
        .count()
    )
    if complaint_count > 0:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Cannot delete zone: {complaint_count} complaint(s) reference it. Disable instead.",
        )
    db.delete(zone)
    db.commit()


# ════════════════════════════════════════════════════════════════════════════════
# Organization Settings
# ════════════════════════════════════════════════════════════════════════════════


def get_org_settings(db: Session, current_user: CurrentUser) -> Organization:
    org = (
        db.query(Organization)
        .filter(Organization.id == current_user.organization_id)
        .first()
    )
    if not org:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Organization not found",
        )
    return org


def update_org_settings(
    db: Session, current_user: CurrentUser, name: str | None = None
) -> Organization:
    org = get_org_settings(db, current_user)
    if name is not None:
        org.name = name
    db.commit()
    db.refresh(org)
    return org
