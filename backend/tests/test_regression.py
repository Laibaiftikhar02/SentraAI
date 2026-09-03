"""Regression tests — verify Gemini integration doesn't break existing endpoints.

Tests run against a live backend on localhost:8000.
Checks: health, auth, admin stats, categories, zones, chatbot fallback, complaint creation.
"""

import json
import os
import sys
import urllib.request
import urllib.error

from dotenv import load_dotenv

# Load credentials from the backend .env file so tests use the same
# seeded passwords the application expects.
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env"))

BASE = "http://localhost:8000"
PASS = 0
FAIL = 0

# Seeded test account credentials come from environment/config only.
USER_EMAIL = os.environ.get("SEED_USER_EMAIL", "student1@sentraai.dev")
SA_EMAIL = os.environ.get("SEED_SUPER_ADMIN_EMAIL", "superadmin@sentraai.dev")
USER_PASSWORD = os.environ.get("SEED_USER_PASSWORD")
SA_PASSWORD = os.environ.get("SEED_SUPER_ADMIN_PASSWORD")

if not all([USER_PASSWORD, SA_PASSWORD]):
    raise RuntimeError(
        "Seed passwords not found in environment. "
        "Ensure SEED_USER_PASSWORD and SEED_SUPER_ADMIN_PASSWORD "
        "are set in backend/.env"
    )


def req(method, path, body=None, token=None):
    """Send an HTTP request and return (status, parsed_json)."""
    url = BASE + path
    data = json.dumps(body).encode() if body else None
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    r = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(r, timeout=90) as resp:
            return resp.status, json.loads(resp.read())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read()) if e.fp else None
    except Exception as e:
        return 0, str(e)


def check(name, ok):
    global PASS, FAIL
    if ok:
        PASS += 1
        print(f"  PASS  {name}")
    else:
        FAIL += 1
        print(f"  FAIL  {name}")


def main():
    """Run the regression checks against the live backend."""
    global PASS, FAIL
    # ── 1. Health check ────────────────────────────────────────────────────────
    print("\n[1] Health check")
    status, data = req("GET", "/api/v1/health")
    check("GET /health returns 200", status == 200)

    # ── 2. Auth: login as student ──────────────────────────────────────────────
    print("\n[2] Auth: login as student")
    status, data = req("POST", "/api/v1/auth/login", {
        "email": USER_EMAIL,
        "password": USER_PASSWORD,
    })
    check("POST /auth/login returns 200", status == 200)
    student_token = data.get("access_token", "") if isinstance(data, dict) else ""
    check("Response has access_token", bool(student_token))

    # ── 3. Auth: login as super-admin ──────────────────────────────────────────
    print("\n[3] Auth: login as super-admin")
    status, data = req("POST", "/api/v1/auth/login", {
        "email": SA_EMAIL,
        "password": SA_PASSWORD,
    })
    check("POST /auth/login (super-admin) returns 200", status == 200)
    admin_token = data.get("access_token", "") if isinstance(data, dict) else ""

    # ── 4. Admin complaints endpoint ──────────────────────────────────────────
    print("\n[4] Admin complaints endpoint")
    status, data = req("GET", "/api/v1/admin/complaints?page=1&page_size=5", token=admin_token)
    check("GET /admin/complaints returns 200", status == 200)
    if isinstance(data, dict):
        check("Response has total key", "total" in data)
        print(f"        total_complaints = {data.get('total', '?')}")

    # ── 5. Categories endpoint (super-admin config) ─────────────────────────
    print("\n[5] Categories endpoint")
    status, data = req("GET", "/api/v1/config/categories", token=admin_token)
    check("GET /config/categories returns 200", status == 200)
    cat_count = len(data) if isinstance(data, list) else 0
    check(f"Categories list returned ({cat_count} items)", cat_count > 0)

    # ── 6. Zones endpoint (super-admin config) ───────────────────────────────
    print("\n[6] Campus zones endpoint")
    status, data = req("GET", "/api/v1/config/zones", token=admin_token)
    check("GET /config/zones returns 200", status == 200)
    zone_count = len(data) if isinstance(data, list) else 0
    check(f"Zones list returned ({zone_count} items)", zone_count > 0)

    # ── 7. Chatbot fallback (no GEMINI_API_KEY) ──────────────────────────────
    print("\n[7] Chatbot fallback (keyword-based)")
    status, data = req("POST", "/api/v1/chatbot/parse", {
        "message": "hostel mein pani nahi aa raha do din se Block A mein",
        "conversation": [],
        "extracted_fields": {},
    }, token=student_token)
    check("POST /chatbot/parse returns 200", status == 200)
    if isinstance(data, dict):
        fields = data.get("fields", {})
        check("Chatbot has bot_message", bool(data.get("bot_message")))
        check("Chatbot detected category", bool(fields.get("category_name")))
        check("Chatbot status is valid", data.get("status") in ("conversing", "ready"))
        print(f"        category = {fields.get('category_name', '?')}")
        print(f"        status = {data.get('status', '?')}")
        print(f"        bot_message = {(data.get('bot_message', '') or '')[:80]}...")

    # ── 8. Chatbot English input ─────────────────────────────────────────────
    print("\n[8] Chatbot English input")
    status, data = req("POST", "/api/v1/chatbot/parse", {
        "message": "Water supply issue in Hostel Wing 1, no water for two days in the washroom area",
        "conversation": [],
        "extracted_fields": {},
    }, token=student_token)
    check("English input returns 200", status == 200)
    if isinstance(data, dict):
        fields = data.get("fields", {})
        check("English title generated", bool(fields.get("title")))
        check("English description generated", bool(fields.get("description")))
        if fields.get("title"):
            print(f"        title = {fields['title']}")

    # ── 9. Chatbot conversation follow-up ────────────────────────────────────
    print("\n[9] Chatbot follow-up conversation")
    status, data = req("POST", "/api/v1/chatbot/parse", {
        "message": "Block A mein",
        "conversation": [
            {"role": "bot", "content": "Hi! Tell me about your issue."},
            {"role": "user", "content": "pani nahi aa raha hostel mein"},
            {"role": "bot", "content": "Which building or block?"},
        ],
        "extracted_fields": {"title": "No water", "description": "pani nahi aa raha"},
    }, token=student_token)
    check("Follow-up returns 200", status == 200)
    if isinstance(data, dict):
        fields = data.get("fields", {})
        check("Zone captured from follow-up", bool(fields.get("zone_name")))
        if fields.get("zone_name"):
            print(f"        zone = {fields['zone_name']}")

    # ── 10. Complaints list endpoint ──────────────────────────────────────────
    print("\n[10] Complaints list (student)")
    status, data = req("GET", "/api/v1/complaints?page=1&page_size=5", token=student_token)
    check("GET /complaints returns 200", status == 200)
    if isinstance(data, dict):
        print(f"        total complaints = {data.get('total', '?')}")

    # ── Summary ───────────────────────────────────────────────────────────────
    print(f"\n{'='*60}")
    print(f"Results: {PASS} passed, {FAIL} failed, {PASS + FAIL} total")
    print(f"{'='*60}")
    return 1 if FAIL > 0 else 0


def test_regression():
    """pytest entry point for the live backend regression checks."""
    exit_code = main()
    assert exit_code == 0, f"Regression test failed ({FAIL} failures)"


if __name__ == "__main__":
    sys.exit(main())
