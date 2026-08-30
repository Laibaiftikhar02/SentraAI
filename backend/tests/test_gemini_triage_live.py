"""Live integration tests for the Gemini complaint-triage provider.

Run against a live backend (localhost:8000):
    python tests\\test_gemini_triage_live.py   (from the backend directory)

Verifies end-to-end behaviour regardless of whether a real GEMINI_API_KEY
is configured on the server:
 1. complaint is saved (AI failure never loses the complaint)
 2. AI prediction is persisted with honest provider/model provenance
 3. category/priority values are validated against org configuration
 4. unrouted complaints stay in General Review (department_id null)
 5. duplicate handling remains safe (no invalid cluster references)
 6. reprocess endpoint still works
 7. complaint listing still works (no regressions)

When provider == "local" in the results, the server is running the honest
local-fallback path — expected when GEMINI_API_KEY is not configured.
When provider == "gemini", a real Gemini call was executed by the server.

NOTE: creates clearly-marked test complaints in the local database.
Skips gracefully (exit 0) when the backend is not reachable or the seeded
student account is unavailable.
"""

import json
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

BASE = "http://localhost:8000"
BACKEND_DIR = Path(__file__).resolve().parents[1]

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


def _env_value(key):
    env_file = BACKEND_DIR / ".env"
    if env_file.exists():
        for line in env_file.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line.startswith(f"{key}="):
                return line.split("=", 1)[1].strip()
    return None


def login_student():
    """Login as the seeded student using the .env seed password."""
    password = _env_value("SEED_USER_PASSWORD") or "Student123!"
    candidates = [("student1@sentraai.dev", password)]
    if password != "Student123!":
        candidates.append(("student1@sentraai.dev", "Student123!"))
    for email, pwd in candidates:
        status, data = req("POST", "/api/v1/auth/login", {"email": email, "password": pwd})
        if status == 200 and isinstance(data, dict) and data.get("access_token"):
            return data["access_token"]
    return None


# ── 0. Server reachability ─────────────────────────────────────────────────

print("=" * 60)
print("GEMINI COMPLAINT-TRIAGE — LIVE INTEGRATION TEST")
print("=" * 60)

status, data = req("GET", "/api/v1/health")
if status != 200:
    print("\nSKIPPED: backend not reachable on localhost:8000")
    print("Start it with:  uvicorn app.main:app --port 8000  (from backend/)")
    sys.exit(0)
print("\n[0] Health check — backend is up")

# ── 1. Login ────────────────────────────────────────────────────────────────

print("\n[1] Login as seeded student")
token = login_student()
if not token:
    print("SKIPPED: could not authenticate as student1@sentraai.dev")
    print("Run the seeding script first:  python -m app.utils.seeding")
    sys.exit(0)
check("student login succeeded", bool(token))

# Reference categories for output validation
status, cats = req("GET", "/api/v1/reference/categories", token=token)
category_names = {c["name"] for c in cats} if status == 200 and isinstance(cats, list) else None
check("reference categories loaded", category_names is not None and len(category_names) > 0)

# ── 2. Create complaint (saved BEFORE any AI processing) ───────────────────

print("\n[2] Create complaint — must be saved even if AI fails")
status, data = req("POST", "/api/v1/complaints", form={
    "title": "[GEMINI-TRIAGE-TEST] Water supply issue in Block A",
    "description": ("[GEMINI-TRIAGE-TEST] There has been no water supply in "
                    "Block A hostel for two days. Taps are completely dry."),
}, token=token)
check("complaint created (201)", status == 201,
      detail=f"status={status} body={data}")
if status != 201:
    print("\nCannot continue without a created complaint.")
    sys.exit(1)
complaint_id = data["data"]["id"]
print(f"        complaint_id = {complaint_id}")

# ── 3. Verify AI prediction + honest provenance ────────────────────────────

print("\n[3] AI prediction persisted with honest provenance")
status, detail = req("GET", f"/api/v1/complaints/{complaint_id}", token=token)
check("complaint detail retrieved", status == 200)
pred = detail.get("ai_prediction") if isinstance(detail, dict) else None
check("ai_status terminal value",
      detail.get("ai_status") in ("completed", "unavailable"),
      detail=f"ai_status={detail.get('ai_status')!r}")
check("AI prediction persisted", pred is not None)

if pred:
    provider = pred.get("provider")
    model = pred.get("model_name")
    print(f"        provider = {provider}")
    print(f"        model_name = {model}")
    check("provider provenance is honest (gemini or local)",
          provider in ("gemini", "local"), detail=f"provider={provider!r}")
    if provider == "gemini":
        check("gemini model name is gemini-3.6-flash", model == "gemini-3.6-flash",
              detail=f"model_name={model!r}")
        print("        NOTE: a real Gemini LLM call was executed by the server.")
    else:
        check("fallback model name is local-rule-based-v1",
              model == "local-rule-based-v1", detail=f"model_name={model!r}")
        print("        NOTE: local fallback provenance — expected when")
        print("        GEMINI_API_KEY is not configured on the server.")
    if pred.get("category") and category_names:
        check("category validated against org config",
              pred["category"] in category_names,
              detail=f"category={pred['category']!r}")
    if pred.get("priority"):
        check("priority is a valid level",
              pred["priority"] in ("critical", "high", "medium", "low"))
    check("needs_manual_review is boolean", isinstance(pred.get("needs_manual_review"), bool))
    if pred.get("department") is None:
        check("unrouted complaint stays in General Review (department_id null)",
              detail.get("department_id") is None)

# ── 4. Duplicate safety — near-identical complaint ─────────────────────────

print("\n[4] Duplicate handling remains safe")
status, data2 = req("POST", "/api/v1/complaints", form={
    "title": "[GEMINI-TRIAGE-TEST] Water supply issue in Block A",
    "description": ("[GEMINI-TRIAGE-TEST] There has been no water supply in "
                    "Block A hostel for two days. Taps are completely dry."),
}, token=token)
check("near-duplicate complaint also saved", status == 201, detail=f"status={status}")
if status == 201:
    dup_id = data2["data"]["id"]
    status, detail2 = req("GET", f"/api/v1/complaints/{dup_id}", token=token)
    check("duplicate complaint retrievable", status == 200)
    pred2 = detail2.get("ai_prediction") or {}
    if pred2.get("duplicate_detected"):
        check("duplicate flag paired with a cluster reference or review flag",
              detail2.get("duplicate_cluster_id") is not None
              or pred2.get("needs_manual_review") is True)
    print(f"        duplicate_detected = {pred2.get('duplicate_detected')}")
    print(f"        duplicate_cluster_id = {detail2.get('duplicate_cluster_id')}")

# ── 5. Reprocess still works ───────────────────────────────────────────────

print("\n[5] Reprocess endpoint")
status, rp = req("POST", f"/api/v1/complaints/{complaint_id}/reprocess", token=token)
check("reprocess returns 200", status == 200, detail=f"status={status} body={rp}")
if status == 200:
    status, detail3 = req("GET", f"/api/v1/complaints/{complaint_id}", token=token)
    pred3 = detail3.get("ai_prediction") if isinstance(detail3, dict) else None
    check("prediction regenerated after reprocess", pred3 is not None)
    if pred3:
        check("provider provenance stable after reprocess",
              pred3.get("provider") in ("gemini", "local"))
        print(f"        provider after reprocess = {pred3.get('provider')}")

# ── 6. Listing regression ──────────────────────────────────────────────────

print("\n[6] Complaint listing (regression)")
status, listing = req("GET", "/api/v1/complaints?page=1&per_page=5", token=token)
check("GET /complaints returns 200", status == 200)
if isinstance(listing, dict):
    check("listing has items/total", "items" in listing and "total" in listing)
    print(f"        total complaints visible = {listing.get('total')}")

# ── Summary ────────────────────────────────────────────────────────────────

print("\n" + "=" * 60)
print(f"Results: {PASS} passed, {FAIL} failed, {PASS + FAIL} total")
print("=" * 60)
sys.exit(1 if FAIL else 0)
