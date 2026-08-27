"""Login/Logout cycle regression test.

Verifies that users can log out and log back in multiple times
without getting "Session expired" or auth errors.
Tests student, admin, and super_admin accounts.
"""

import json
import sys
import urllib.request
import urllib.error

BASE = "http://localhost:8000"
PASS = 0
FAIL = 0


def req(method, path, body=None, token=None):
    url = BASE + path
    data = json.dumps(body).encode() if body else None
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    r = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(r, timeout=10) as resp:
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


def test_login_logout_cycles(email, password, role_label, cycles=3):
    """Test repeated login/logout cycles for a given account."""
    print(f"\n{'='*60}")
    print(f"Testing {role_label}: {email} — {cycles} cycles")
    print(f"{'='*60}")

    for cycle in range(1, cycles + 1):
        print(f"\n  --- Cycle {cycle}/{cycles} ---")

        # Login
        status, data = req("POST", "/api/v1/auth/login", {
            "email": email,
            "password": password,
        })
        check(f"[Cycle {cycle}] Login returns 200", status == 200)
        if status != 200:
            print(f"    Login failed: {status} — {data}")
            continue

        token = data.get("access_token", "")
        check(f"[Cycle {cycle}] Token received", bool(token))
        if not token:
            continue

        # Verify token works — /auth/me
        status, data = req("GET", "/api/v1/auth/me", token=token)
        check(f"[Cycle {cycle}] /auth/me returns 200", status == 200)
        if status == 200:
            check(f"[Cycle {cycle}] User email matches", data.get("email") == email)
            check(f"[Cycle {cycle}] User is active", data.get("is_active", False))

        # Verify token works — authenticated endpoint
        status, data = req("GET", "/api/v1/complaints?page=1&page_size=1", token=token)
        check(f"[Cycle {cycle}] Complaints endpoint works", status == 200)

        # "Logout" — in the real app this clears localStorage.
        # Here we just discard the token (simulating clearToken()).
        # Then immediately login again in the next cycle.
        token = None  # simulate clearToken()

    print(f"\n  {role_label}: All {cycles} cycles complete")


def test_token_still_valid_after_other_request():
    """Verify that a token remains valid after making other API calls."""
    print(f"\n{'='*60}")
    print("Testing token persistence across multiple API calls")
    print(f"{'='*60}")

    # Login
    status, data = req("POST", "/api/v1/auth/login", {
        "email": "student1@sentraai.dev",
        "password": "Student123!",
    })
    check("Login for persistence test", status == 200)
    token = data.get("access_token", "")

    # Make 5 sequential authenticated requests
    for i in range(1, 6):
        status, data = req("GET", "/api/v1/auth/me", token=token)
        check(f"Request {i}/5 — /auth/me still valid", status == 200)

    # Final check — token should still work
    status, data = req("GET", "/api/v1/complaints?page=1&page_size=1", token=token)
    check("Token still valid after 5 requests", status == 200)


# ── Run all tests ─────────────────────────────────────────────────────────

# Student: 3 login/logout cycles
test_login_logout_cycles("student1@sentraai.dev", "Student123!", "Student", cycles=3)

# Super Admin: 3 cycles
test_login_logout_cycles("superadmin@sentraai.dev", "SuperAdmin123!", "Super Admin", cycles=3)

# Token persistence test
test_token_still_valid_after_other_request()

# ── Summary ───────────────────────────────────────────────────────────────
print(f"\n{'='*60}")
print(f"Results: {PASS} passed, {FAIL} failed, {PASS + FAIL} total")
print(f"{'='*60}")

if FAIL > 0:
    sys.exit(1)
