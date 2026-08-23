"""
Seed script for SentraAI hackathon demo.
Creates organization, departments, categories, campus zones, routing rules,
and pre-provisioned accounts.

ALL passwords come from environment variables — nothing is hardcoded.

Usage:
    Set environment variables first (see .env.example), then:
    python -m app.utils.seeding
"""

import os
import sys
import json

# Ensure backend root is on sys.path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

# Load .env file so os.environ picks up seed passwords
from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), ".env"))

from sqlalchemy.orm import Session
from app.database import SessionLocal, engine
from app.models import Base
from app.models.organization import Organization
from app.models.department import Department
from app.models.category import Category
from app.models.campus_zone import CampusZone
from app.models.routing_rule import RoutingRule
from app.models.user import User
from app.models.admin_department import AdminDepartment
from app.services.auth_service import hash_password


def seed(db: Session) -> None:
    # Skip if already seeded
    if db.query(Organization).first():
        print("Database already seeded. Skipping.")
        return

    # ── Organization ──────────────────────────────────────────────
    org = Organization(
        name="SentraAI University",
        description="Demo university for AI hackathon MVP",
    )
    db.add(org)
    db.flush()

    # ── Departments ───────────────────────────────────────────────
    depts = {}
    for name in ["IT Support", "Facilities & Maintenance", "Security & Emergency",
                  "Student Affairs", "Billing & Finance"]:
        d = Department(organization_id=org.id, name=name, is_active=True)
        db.add(d)
        db.flush()
        depts[name] = d

    # ── Categories ────────────────────────────────────────────────
    cat_map = {
        "Network / Internet": "IT Support",
        "Computer / Hardware": "IT Support",
        "Software / Portal": "IT Support",
        "Water Supply": "Facilities & Maintenance",
        "Electricity / Power": "Facilities & Maintenance",
        "Cleanliness / Sanitation": "Facilities & Maintenance",
        "Furniture / Infrastructure": "Facilities & Maintenance",
        "Fire / Safety Emergency": "Security & Emergency",
        "Theft / Security": "Security & Emergency",
        "Unauthorized Access": "Security & Emergency",
        "Hostel Complaint": "Student Affairs",
        "Academic Issue": "Student Affairs",
        "Discipline / Conduct": "Student Affairs",
        "Fee / Payment": "Billing & Finance",
        "Scholarship": "Billing & Finance",
        "Refund": "Billing & Finance",
    }
    cats = {}
    for cat_name, dept_name in cat_map.items():
        c = Category(
            organization_id=org.id,
            name=cat_name,
            is_active=True,
        )
        db.add(c)
        db.flush()
        cats[cat_name] = (c, depts[dept_name])

    # ── Campus Zones (SVG polygon data) ───────────────────────────
    zones_data = [
        ("Main Building", "academic", [[100, 50], [300, 50], [300, 200], [100, 200]]),
        ("Block A", "academic", [[350, 50], [520, 50], [520, 200], [350, 200]]),
        ("Block B", "academic", [[570, 50], [740, 50], [740, 200], [570, 200]]),
        ("Hostel Wing 1", "hostel", [[100, 260], [280, 260], [280, 400], [100, 400]]),
        ("Hostel Wing 2", "hostel", [[330, 260], [510, 260], [510, 400], [330, 400]]),
        ("Library", "building", [[560, 260], [740, 260], [740, 400], [560, 400]]),
        ("Cafeteria", "building", [[100, 440], [300, 440], [300, 550], [100, 550]]),
        ("Sports Complex", "outdoor", [[350, 440], [600, 440], [600, 550], [350, 550]]),
    ]
    zones = {}
    for name, ztype, poly in zones_data:
        z = CampusZone(
            organization_id=org.id,
            name=name,
            zone_type=ztype,
            polygon_json=poly,
            is_active=True,
        )
        db.add(z)
        db.flush()
        zones[name] = z

    # ── Routing Rules (category → department) ─────────────────────
    for cat_name, (cat, dept) in cats.items():
        rule = RoutingRule(
            organization_id=org.id,
            category_id=cat.id,
            department_id=dept.id,
            is_active=True,
        )
        db.add(rule)

    # ── Users (passwords from environment variables) ──────────────
    sa_password = os.environ.get("SEED_SUPER_ADMIN_PASSWORD")
    if not sa_password:
        print("ERROR: SEED_SUPER_ADMIN_PASSWORD environment variable is required.")
        sys.exit(1)

    super_admin = User(
        organization_id=org.id,
        email=os.environ.get("SEED_SUPER_ADMIN_EMAIL", "superadmin@sentraai.dev"),
        password_hash=hash_password(sa_password),
        name="Super Admin",
        role="super_admin",
        is_active=True,
    )
    db.add(super_admin)

    # Department Admins
    admin_password = os.environ.get("SEED_ADMIN_PASSWORD")
    if not admin_password:
        print("ERROR: SEED_ADMIN_PASSWORD environment variable is required.")
        sys.exit(1)

    admin_dept_pairs = [
        ("IT Admin", "IT Support"),
        ("Facilities Admin", "Facilities & Maintenance"),
        ("Security Admin", "Security & Emergency"),
    ]
    for admin_name, dept_name in admin_dept_pairs:
        email_slug = admin_name.lower().replace(" ", ".")
        admin = User(
            organization_id=org.id,
            email=f"{email_slug}@sentraai.dev",
            password_hash=hash_password(admin_password),
            name=admin_name,
            role="admin",
            is_active=True,
        )
        db.add(admin)
        db.flush()
        db.add(AdminDepartment(
            user_id=admin.id,
            department_id=depts[dept_name].id,
        ))

    # Test Users
    user_password = os.environ.get("SEED_USER_PASSWORD")
    if not user_password:
        print("ERROR: SEED_USER_PASSWORD environment variable is required.")
        sys.exit(1)

    for i in range(1, 4):
        user = User(
            organization_id=org.id,
            email=f"student{i}@sentraai.dev",
            password_hash=hash_password(user_password),
            name=f"Test Student {i}",
            role="user",
            is_active=True,
        )
        db.add(user)

    db.commit()
    print("Seed data created successfully.")
    print(f"  Organization: {org.name}")
    print(f"  Departments:  {len(depts)}")
    print(f"  Categories:   {len(cats)}")
    print(f"  Campus Zones: {len(zones)}")
    print(f"  Super Admin:  {super_admin.email}")
    print(f"  Dept Admins:  {len(admin_dept_pairs)}")
    print(f"  Test Users:   3")


def main() -> None:
    # Create all tables (for dev convenience; production uses Alembic)
    Base.metadata.create_all(bind=engine)
    print("Database tables ensured.")

    db = SessionLocal()
    try:
        seed(db)
    finally:
        db.close()


if __name__ == "__main__":
    main()
