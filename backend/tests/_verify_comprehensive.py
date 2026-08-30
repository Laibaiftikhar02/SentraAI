"""Comprehensive backend verification — all APIs, roles, lifecycle, AI."""
import json, sys, urllib.request, urllib.parse, urllib.error
from pathlib import Path

BASE = "http://localhost:8000"
BACKEND_DIR = Path(__file__).resolve().parents[1]


def req(method, path, body=None, token=None, form=None):
    url = BASE + path
    headers = {}
    data = None
    if form is not None:
        data = urllib.parse.urlencode(form).encode()
        headers["Content-Type"] = "application/x-www-form-urlencoded"
    elif body is not None:
        data = json.dumps(body).encode()
        headers["Content-Type"] = "application/json"
    if token:
        headers["Authorization"] = f"Bearer {token}"
    r = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(r, timeout=120) as resp:
            return resp.status, json.loads(resp.read())
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read())
        except Exception:
            return e.code, None
    except Exception as e:
        return 0, str(e)


def env_val(k):
    env_file = BACKEND_DIR / ".env"
    for line in env_file.read_text(encoding="utf-8").splitlines():
        if line.startswith(f"{k}="):
            return line.split("=", 1)[1].strip()
    return ""


PASS = 0
FAIL = 0


def check(name, ok, detail=""):
    global PASS, FAIL
    if ok:
        PASS += 1
        print(f"  PASS  {name}")
    else:
        FAIL += 1
        print(f"  FAIL  {name}" + (f" — {detail}" if detail else ""))


# Login all roles
s, d = req("POST", "/api/v1/auth/login", {"email": "student1@sentraai.dev", "password": env_val("SEED_USER_PASSWORD")})
user_token = d.get("access_token") if s == 200 else None

s, d = req("POST", "/api/v1/auth/login", {"email": "it.admin@sentraai.dev", "password": env_val("SEED_ADMIN_PASSWORD")})
admin_token = d.get("access_token") if s == 200 else None

s, d = req("POST", "/api/v1/auth/login", {"email": "superadmin@sentraai.dev", "password": env_val("SEED_SUPER_ADMIN_PASSWORD")})
sa_token = d.get("access_token") if s == 200 else None

print("=" * 60)
print("COMPREHENSIVE BACKEND VERIFICATION")
print("=" * 60)

# 1. Auth / Roles
print("\n[1] Auth & Roles")
check("student login", bool(user_token))
check("admin login", bool(admin_token))
check("super_admin login", bool(sa_token))
if user_token:
    s, me = req("GET", "/api/v1/auth/me", token=user_token)
    check("GET /auth/me (user)", s == 200 and me.get("role") == "user")

# 2. Complaint lifecycle
print("\n[2] Complaint lifecycle")
s, d = req("POST", "/api/v1/complaints", form={
    "title": "[VERIFY] Fire emergency test",
    "description": "[VERIFY] There is a fire in Building A, emergency situation.",
}, token=user_token)
check("POST /complaints 201", s == 201, f"status={s}")
cid = d["data"]["id"] if s == 201 else None

if cid:
    s, detail = req("GET", f"/api/v1/complaints/{cid}", token=user_token)
    check("GET /complaints/{id}", s == 200)
    pred = detail.get("ai_prediction") or {}
    check("ai_status terminal", detail.get("ai_status") in ("completed", "unavailable"))
    check("AI prediction present", bool(pred))
    if pred:
        check("provider provenance", pred.get("provider") in ("gemini", "local"))
        check("model_name present", pred.get("model_name") is not None)
        check("priority valid", pred.get("priority") in ("critical", "high", "medium", "low"))
        check("summary non-empty", bool(pred.get("summary")))
        if pred.get("category"):
            cats_resp = req("GET", "/api/v1/reference/categories", token=user_token)
            cat_names = {c["name"] for c in cats_resp[1]} if cats_resp[0] == 200 else set()
            check("category in org config", pred["category"] in cat_names)
    check("original title preserved", detail.get("title") == "[VERIFY] Fire emergency test")
    check("original description preserved", "[VERIFY] There is a fire" in (detail.get("description") or ""))

# 3. Admin endpoints
print("\n[3] Admin complaint detail (model_name fix)")
if cid and admin_token:
    s, admin_detail = req("GET", f"/api/v1/admin/complaints/{cid}", token=admin_token)
    check("admin complaint access (200 or 403)", s in (200, 403))
    if s == 200:
        ap = admin_detail.get("ai_prediction") or {}
        check("admin detail has model_name", "model_name" in ap, f"keys={list(ap.keys())}")
        check("admin detail has provider", "provider" in ap)

# 4. Admin inbox + filters
print("\n[4] Admin inbox + filters")
if admin_token:
    s, listing = req("GET", "/api/v1/admin/complaints?page=1&per_page=5", token=admin_token)
    check("GET /admin/complaints", s == 200)
    s, listing = req("GET", "/api/v1/admin/complaints?priority=critical", token=admin_token)
    check("admin filter: priority", s == 200)
    s, listing = req("GET", "/api/v1/admin/complaints?search=water", token=admin_token)
    check("admin filter: search", s == 200)
    s, listing = req("GET", "/api/v1/admin/complaints?status=created", token=admin_token)
    check("admin filter: status", s == 200)

# 5. Analytics
print("\n[5] Analytics endpoints")
if admin_token:
    for ep, key in [
        ("/analytics/heatmap", "zones"),
        ("/analytics/complaints", None),
        ("/analytics/urgency", None),
        ("/analytics/categories", None),
        ("/analytics/locations", None),
        ("/analytics/duplicates", None),
        ("/analytics/departments", None),
    ]:
        s, d = req("GET", f"/api/v1{ep}", token=admin_token)
        ok = s == 200
        if key:
            ok = ok and isinstance(d, dict) and key in d
        check(f"GET {ep}", ok)

# 6. Config (super_admin)
print("\n[6] Config endpoints (super_admin)")
if sa_token:
    for ep in ["/config/departments", "/config/categories", "/config/zones", "/config/admins"]:
        s, d = req("GET", f"/api/v1{ep}", token=sa_token)
        check(f"GET {ep}", s == 200 and isinstance(d, list))
    s, d = req("GET", "/api/v1/config/org", token=sa_token)
    check("GET /config/org", s == 200)

# 7. Role restrictions
print("\n[7] Role restrictions")
s, _ = req("GET", "/api/v1/config/departments", token=user_token)
check("user blocked from config (403)", s == 403)
s, _ = req("GET", "/api/v1/analytics/heatmap", token=user_token)
check("user blocked from analytics (403)", s == 403)

# 8. Reference data
print("\n[8] Reference data")
s, cats = req("GET", "/api/v1/reference/categories", token=user_token)
check("GET /reference/categories", s == 200 and len(cats) > 0)
s, zones = req("GET", "/api/v1/reference/zones", token=user_token)
check("GET /reference/zones", s == 200 and len(zones) > 0)

# 9. Notifications
print("\n[9] Notifications")
s, notifs = req("GET", "/api/v1/notifications", token=user_token)
check("GET /notifications", s == 200 and isinstance(notifs, list))

# 10. Chatbot
print("\n[10] Chatbot")
s, d = req("POST", "/api/v1/chatbot/parse", {
    "message": "No water in Block A",
    "conversation": [],
    "extracted_fields": {},
}, token=user_token)
check("POST /chatbot/parse", s == 200 and "bot_message" in d)

# 11. Reprocess
print("\n[11] Reprocess endpoint")
if cid:
    s, rp = req("POST", f"/api/v1/complaints/{cid}/reprocess", token=user_token)
    check("POST /complaints/{id}/reprocess", s == 200)

# 12. History
print("\n[12] Append-only history")
if cid:
    s, hist = req("GET", f"/api/v1/complaints/{cid}/history", token=user_token)
    check("GET /complaints/{id}/history", s == 200 and isinstance(hist, list) and len(hist) > 0)

# 13. Complaint stats
print("\n[13] Complaint stats")
s, stats = req("GET", "/api/v1/complaints/stats", token=user_token)
check("GET /complaints/stats", s == 200 and "total" in stats)

# 14. Admin departments + admins list
print("\n[14] Admin helper endpoints")
if admin_token:
    s, depts = req("GET", "/api/v1/admin/departments", token=admin_token)
    check("GET /admin/departments", s == 200 and isinstance(depts, list))
    s, admins = req("GET", "/api/v1/admin/admins", token=admin_token)
    check("GET /admin/admins", s == 200 and isinstance(admins, list))

# 15. Health
print("\n[15] Health")
s, d = req("GET", "/api/v1/health")
check("GET /health", s == 200)

print("\n" + "=" * 60)
print(f"Results: {PASS} passed, {FAIL} failed, {PASS + FAIL} total")
print("=" * 60)
sys.exit(1 if FAIL else 0)
