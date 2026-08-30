"""Offline unit tests for the Gemini complaint-triage provider.

Run:
    python tests\\test_gemini_triage.py   (from the backend directory)

No network, no API key, no database required — the Gemini SDK client is
replaced with fakes.  Live end-to-end verification lives in
tests/test_gemini_triage_live.py.
"""

import json
import sys
from pathlib import Path
from uuid import uuid4

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.ai import _build_provider
from app.ai.gemini_provider import GeminiAIProvider, _TriageOutput
from app.ai.local_provider import LocalAIProvider

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


def _json_ok(obj) -> bool:
    try:
        json.dumps(obj)
        return True
    except (TypeError, ValueError):
        return False


# ── Test doubles ────────────────────────────────────────────────────────────

class _StubSettings:
    """Only the attributes GeminiAIProvider reads."""

    def __init__(self, gemini_api_key="test-key", ai_api_key="", ai_model="",
                 ai_timeout_seconds=20, ai_max_retries=1):
        self.gemini_api_key = gemini_api_key
        self.ai_api_key = ai_api_key
        self.ai_model = ai_model
        self.ai_timeout_seconds = ai_timeout_seconds
        self.ai_max_retries = ai_max_retries


class _FakeResponse:
    def __init__(self, payload):
        self._payload = payload

    @property
    def parsed(self):
        return self._payload if isinstance(self._payload, (_TriageOutput, dict)) else None

    @property
    def text(self):
        if isinstance(self._payload, _TriageOutput):
            return self._payload.model_dump_json()
        if isinstance(self._payload, dict):
            return json.dumps(self._payload)
        return self._payload


class _FakeModels:
    def __init__(self, behavior):
        self.behavior = behavior  # _TriageOutput | dict | str | Exception
        self.calls = 0

    def generate_content(self, *, model, contents, config=None):
        self.calls += 1
        if isinstance(self.behavior, Exception):
            raise self.behavior
        return _FakeResponse(self.behavior)


class _FakeClient:
    def __init__(self, behavior):
        self.models = _FakeModels(behavior)


def make_provider(behavior=None, settings=None):
    """Build a provider; when behavior is given, replace the SDK client."""
    provider = GeminiAIProvider(settings or _StubSettings())
    if behavior is not None:
        fake = _FakeClient(behavior)
        provider._get_client = lambda: fake
        provider._build_config = lambda system_instruction=None: None
        return provider, fake
    return provider, None


# ── Shared complaint context (mirrors ai_processing._gather_org_context) ────

_DUP_CLUSTER_ID = uuid4()


def _build_ctx():
    dup_id = str(uuid4())
    cluster_dup_id = str(uuid4())
    ctx = {
        "title": "No water supply in Block A",
        "description": "There has been no water supply in Block A hostel for two days.",
        "categories": [
            {"id": str(uuid4()), "name": "Water Supply", "description": "Water and plumbing"},
            {"id": str(uuid4()), "name": "Electricity / Power", "description": "Power issues"},
        ],
        "departments": [
            {"id": str(uuid4()), "name": "Facilities and Maintenance"},
            {"id": str(uuid4()), "name": "IT Services"},
        ],
        "routing_rules": [{
            "category_id": str(uuid4()), "category_name": "Water Supply",
            "department_id": str(uuid4()), "department_name": "Facilities and Maintenance",
        }],
        "priority_rules": [{
            "category_id": str(uuid4()), "category_name": "Water Supply",
            "priority_level": "high", "weight": 5,
        }],
        "zone_name": "Block A",
        "existing_complaints": [
            {"id": dup_id, "title": "Water outage in Block A",
             "description": "No water in Block A since Monday.",
             "duplicate_cluster_id": None},
            {"id": cluster_dup_id, "title": "Broken chair in Library",
             "description": "Chair is broken.",
             "duplicate_cluster_id": _DUP_CLUSTER_ID},
        ],
    }
    return ctx, dup_id, cluster_dup_id


CTX, DUP_ID, CLUSTER_DUP_ID = _build_ctx()


# ── Provider tests ──────────────────────────────────────────────────────────

def test_factory_selection():
    s = _StubSettings()
    check("factory: 'gemini' selects GeminiAIProvider",
          isinstance(_build_provider("gemini", s), GeminiAIProvider))
    check("factory: 'local' selects LocalAIProvider",
          isinstance(_build_provider("local", s), LocalAIProvider))
    check("factory: 'mock' still maps to LocalAIProvider",
          isinstance(_build_provider("mock", s), LocalAIProvider))
    check("factory: unknown name maps to LocalAIProvider",
          isinstance(_build_provider("bogus", s), LocalAIProvider))
    check("factory: default model is gemini-3.6-flash",
          _build_provider("gemini", _StubSettings()).model_name == "gemini-3.6-flash")
    check("factory: AI_MODEL override honoured",
          _build_provider("gemini", _StubSettings(ai_model="gemini-2.5-pro")).model_name
          == "gemini-2.5-pro")


def test_valid_structured_response():
    provider, _ = make_provider(_TriageOutput(
        summary="No water supply in Block A hostel for two days.",
        category="Water Supply", category_confidence=0.95,
        priority="high", priority_confidence=0.9,
        priority_rationale="Essential service disrupted for two days",
        department="Facilities and Maintenance", routing_confidence=0.9,
        duplicate_of_id=DUP_ID, duplicate_similarity=0.85,
        needs_manual_review=False,
        notes="Clear water supply disruption matching routing rules",
    ))
    r = provider.analyze_complaint(**CTX)
    check("valid: summary", r.summary == "No water supply in Block A hostel for two days.")
    check("valid: category mapped", r.category == "Water Supply")
    check("valid: department mapped", r.department == "Facilities and Maintenance")
    check("valid: priority", r.priority == "high")
    check("valid: no manual review", r.needs_manual_review is False)
    check("valid: duplicate detected from shortlist", r.duplicate_detected is True)
    check("valid: duplicate similarity", abs((r.duplicate_similarity or 0) - 0.85) < 1e-9)
    check("valid: provenance is gemini", provider.provider_name == "gemini")
    check("valid: model provenance", provider.model_name == "gemini-3.6-flash")
    check("valid: explanation marks gemini path",
          r.explanation.get("provider_path") == "gemini")
    check("valid: explanation JSON-serializable", _json_ok(r.explanation))


def test_duplicate_cluster_passthrough():
    provider, _ = make_provider(_TriageOutput(
        summary="s", category="Water Supply", category_confidence=0.9,
        priority="medium", priority_confidence=0.7,
        department="Facilities and Maintenance", routing_confidence=0.8,
        duplicate_of_id=CLUSTER_DUP_ID,
    ))
    r = provider.analyze_complaint(**CTX)
    check("duplicate: cluster id passed through from shortlist",
          r.duplicate_cluster_id == _DUP_CLUSTER_ID)
    check("duplicate: detected", r.duplicate_detected is True)


def test_invalid_duplicate_id():
    provider, _ = make_provider(_TriageOutput(
        summary="s", category="Water Supply", category_confidence=0.9,
        priority="medium", priority_confidence=0.7,
        department="Facilities and Maintenance", routing_confidence=0.8,
        duplicate_of_id=str(uuid4()),  # NOT in the shortlist — must be ignored
    ))
    r = provider.analyze_complaint(**CTX)
    check("invalid duplicate id: not detected", r.duplicate_detected is False)
    check("invalid duplicate id: no cluster reference", r.duplicate_cluster_id is None)


def test_invalid_values():
    provider, _ = make_provider(_TriageOutput(
        summary="", category="Quantum Entanglement", category_confidence=0.9,
        priority="extreme", priority_confidence=0.8,
        department="Hogwarts Maintenance", routing_confidence=0.8,
    ))
    r = provider.analyze_complaint(**CTX)
    check("invalid category: nulled with confidence",
          r.category is None and r.category_confidence is None)
    check("invalid department: nulled", r.department is None)
    check("invalid department: routing confidence forced low", r.routing_confidence == 0.10)
    check("invalid priority: nulled with confidence",
          r.priority is None and r.priority_confidence is None)
    check("invalid values: manual review flagged", r.needs_manual_review is True)
    check("invalid values: summary falls back to description",
          bool(r.summary) and r.summary.startswith("There has been no water"))


def test_confidence_normalization():
    provider, _ = make_provider(_TriageOutput(
        summary="s", category="Water Supply", category_confidence=87,   # percent → 0.87
        priority="high", priority_confidence=150,                        # nonsense → None
        department="Facilities and Maintenance", routing_confidence=-2,  # clamp → 0.0
    ))
    r = provider.analyze_complaint(**CTX)
    check("confidence: percent value scaled", abs((r.category_confidence or 0) - 0.87) < 1e-9)
    check("confidence: out-of-range value dropped", r.priority_confidence is None)
    check("confidence: negative clamped to 0", r.routing_confidence == 0.0)
    check("confidence: manual review on low/missing confidence",
          r.needs_manual_review is True)


def test_missing_api_key():
    provider, _ = make_provider(None, _StubSettings(gemini_api_key="", ai_api_key=""))
    r = provider.analyze_complaint(**CTX)
    check("missing key: local fallback used", r.explanation.get("fallback") is True)
    check("missing key: provenance is local", provider.provider_name == "local")
    check("missing key: model provenance is local",
          provider.model_name == "local-rule-based-v1")
    check("missing key: reason mentions API key",
          "api key" in (r.explanation.get("fallback_reason") or "").lower())
    check("missing key: complete local result returned",
          r.priority in ("critical", "high", "medium", "low"))


def test_legacy_ai_api_key_still_honoured():
    provider, _ = make_provider(
        _TriageOutput(
            summary="s", category="Water Supply", category_confidence=0.9,
            priority="high", priority_confidence=0.9,
            department="Facilities and Maintenance", routing_confidence=0.9,
        ),
        _StubSettings(gemini_api_key="", ai_api_key="legacy-key"),
    )
    r = provider.analyze_complaint(**CTX)
    check("legacy key: gemini path used", provider.provider_name == "gemini")
    check("legacy key: no fallback marker", not r.explanation.get("fallback"))


def test_malformed_response():
    provider, _ = make_provider("this is { not json")
    r = provider.analyze_complaint(**CTX)
    check("malformed: local fallback used", r.explanation.get("fallback") is True)
    check("malformed: provenance is local", provider.provider_name == "local")
    check("malformed: model provenance is local",
          provider.model_name == "local-rule-based-v1")
    check("malformed: reason recorded", bool(r.explanation.get("fallback_reason")))
    check("malformed: explanation JSON-serializable", _json_ok(r.explanation))


def test_schema_validation_failure():
    # Wrong field types → pydantic ValidationError → local fallback
    provider, _ = make_provider({"summary": 12345, "category": ["not", "a", "string"]})
    r = provider.analyze_complaint(**CTX)
    check("schema violation: local fallback used", r.explanation.get("fallback") is True)


def test_empty_response():
    provider, _ = make_provider("")
    r = provider.analyze_complaint(**CTX)
    check("empty response: local fallback used", r.explanation.get("fallback") is True)


def test_timeout_falls_back_after_retry():
    provider, fake = make_provider(TimeoutError("Request timed out after 20s"))
    r = provider.analyze_complaint(**CTX)
    check("timeout: retried once then fell back", fake.models.calls == 2,
          detail=f"calls={fake.models.calls}")
    check("timeout: fallback used", r.explanation.get("fallback") is True)


def test_api_error_falls_back():
    provider, fake = make_provider(RuntimeError("500 Internal Server Error"))
    r = provider.analyze_complaint(**CTX)
    check("api error: retried then fell back", fake.models.calls == 2,
          detail=f"calls={fake.models.calls}")
    check("api error: fallback used", r.explanation.get("fallback") is True)


def test_rate_limit_falls_back():
    provider, fake = make_provider(RuntimeError("429 RESOURCE_EXHAUSTED quota exceeded"))
    r = provider.analyze_complaint(**CTX)
    check("rate limit: retried then fell back", fake.models.calls == 2,
          detail=f"calls={fake.models.calls}")
    check("rate limit: fallback used", r.explanation.get("fallback") is True)


def test_auth_error_no_retry():
    provider, fake = make_provider(
        RuntimeError("API key not valid. Please pass a valid API key.")
    )
    r = provider.analyze_complaint(**CTX)
    check("auth error: no retry", fake.models.calls == 1,
          detail=f"calls={fake.models.calls}")
    check("auth error: fallback used", r.explanation.get("fallback") is True)


def test_zero_retries_config():
    provider, fake = make_provider(
        TimeoutError("timeout"), _StubSettings(ai_max_retries=0)
    )
    r = provider.analyze_complaint(**CTX)
    check("zero retries: single attempt", fake.models.calls == 1,
          detail=f"calls={fake.models.calls}")
    check("zero retries: fallback used", r.explanation.get("fallback") is True)


def test_fallback_never_raises():
    for behavior in (ValueError("boom"), KeyError("missing"), RuntimeError("weird failure")):
        provider, _ = make_provider(behavior)
        r = provider.analyze_complaint(**CTX)
        ok = r is not None and r.explanation.get("fallback") is True
        check(f"unexpected error {type(behavior).__name__}: safe local fallback", ok)


def test_code_fence_stripping():
    provider, _ = make_provider(_TriageOutput(summary="s"))
    fenced = (
        "```json\n"
        + _TriageOutput(summary="fenced", category="Water Supply").model_dump_json()
        + "\n```"
    )
    out = provider._extract_structured(_FakeResponse(fenced))
    check("code fences stripped and parsed", out.category == "Water Supply")


if __name__ == "__main__":
    tests = [
        test_factory_selection,
        test_valid_structured_response,
        test_duplicate_cluster_passthrough,
        test_invalid_duplicate_id,
        test_invalid_values,
        test_confidence_normalization,
        test_missing_api_key,
        test_legacy_ai_api_key_still_honoured,
        test_malformed_response,
        test_schema_validation_failure,
        test_empty_response,
        test_timeout_falls_back_after_retry,
        test_api_error_falls_back,
        test_rate_limit_falls_back,
        test_auth_error_no_retry,
        test_zero_retries_config,
        test_fallback_never_raises,
        test_code_fence_stripping,
    ]
    for t in tests:
        print(f"\n[{t.__name__}]")
        t()

    print("\n" + "=" * 60)
    print(f"Results: {PASS} passed, {FAIL} failed, {PASS + FAIL} total")
    print("=" * 60)
    sys.exit(1 if FAIL else 0)
