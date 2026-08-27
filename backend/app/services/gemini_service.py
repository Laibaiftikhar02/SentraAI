"""Gemini LLM integration for the SentraAI Reporting Chatbot.

Uses Google's Gemini API (free tier) for intelligent, multilingual
conversation with function calling and structured output.

The Gemini model:
- Understands ANY language (English, Urdu, Roman Urdu, Arabic, Hindi, etc.)
- Collects missing information through natural conversation
- Uses function calling to verify locations against the DB
- Generates professional English issue titles and descriptions
- Never auto-submits — always requires student confirmation

This service is purely additive — it does NOT replace the existing
keyword-based chatbot_service.py or the SentraAI AI pipeline.
If Gemini is unavailable (no API key, API error), the system falls
back to the existing keyword-based chatbot automatically.
"""

from __future__ import annotations

import json
import logging
import os
from typing import Any

logger = logging.getLogger(__name__)

# ── Gemini model (free tier) ─────────────────────────────────────────────
GEMINI_MODEL = "gemini-3.6-flash"

# Maximum function-call round-trips per turn (prevents infinite loops)
_MAX_FUNCTION_ROUNDS = 2


# ── Function declarations for Gemini tool calling ────────────────────────

def _build_tool_declarations() -> list[dict]:
    """Build function declarations for Gemini tool calling.

    These are READ-ONLY backend functions that let Gemini verify
    locations and categories against the existing database.
    """
    return [
        {
            "type": "function",
            "name": "get_campus_zones",
            "description": (
                "Returns all available campus zones/locations from the database. "
                "Use this to see what locations exist on campus."
            ),
            "parameters": {
                "type": "object",
                "properties": {},
            },
        },
        {
            "type": "function",
            "name": "find_matching_zones",
            "description": (
                "Searches for campus zones matching a text query. "
                "Use when a student mentions a location and you want to "
                "find the best matching campus zone. Returns matching zones "
                "or a message saying no match was found."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": (
                            "The location text to search for, e.g. "
                            "'Engineering Block', 'Block A', 'hostel'"
                        ),
                    },
                },
                "required": ["query"],
            },
        },
        {
            "type": "function",
            "name": "get_categories",
            "description": (
                "Returns all available issue categories from the database. "
                "Use this to determine what issue types are available."
            ),
            "parameters": {
                "type": "object",
                "properties": {},
            },
        },
    ]


# ── Structured output JSON schema ────────────────────────────────────────

RESPONSE_SCHEMA: dict = {
    "type": "object",
    "properties": {
        "reply": {
            "type": "string",
            "description": (
                "The student-facing response message in the student's own "
                "language/style. When issueReady is true, include instructions "
                "about Confirm & Submit, Edit, and Cancel."
            ),
        },
        "issueReady": {
            "type": "boolean",
            "description": (
                "True when enough information has been collected to show "
                "the issue preview (at minimum: a clear description and "
                "a location). False if more info is still needed."
            ),
        },
        "titleEnglish": {
            "type": "string",
            "description": (
                "Professional English title for the issue (5-10 words, title case). "
                "Must NOT copy the user's raw message. Must be formal English only. "
                "Examples: 'Water Supply Issue in Block A', "
                "'AC Malfunction in Classroom 201', "
                "'Cleanliness Problem in Library Washroom'"
            ),
        },
        "descriptionEnglish": {
            "type": "string",
            "description": (
                "Professional English description of the issue in 1-2 sentences. "
                "Must NOT copy the user's raw message verbatim. "
                "Rewrite the student's meaning in formal, clear English. "
                "Must not add facts the student did not provide."
            ),
        },
        "category": {
            "type": "string",
            "description": (
                "The exact name of the best matching issue category "
                "from the available categories list. Must match exactly."
            ),
        },
        "location": {
            "type": "string",
            "description": (
                "The location the student mentioned (free text, "
                "e.g. 'Engineering Block, Room 301')."
            ),
        },
        "campusZone": {
            "type": "string",
            "description": (
                "The exact name of the verified campus zone from the "
                "database. Must match a zone name exactly. "
                "Leave empty if no zone matches."
            ),
        },
        "locationStatus": {
            "type": "string",
            "enum": ["missing", "verified", "ambiguous"],
            "description": (
                "'missing' if no location provided yet, "
                "'verified' if location matches a campus zone exactly, "
                "'ambiguous' if location is unclear or matches multiple zones."
            ),
        },
        "missingInformation": {
            "type": "array",
            "items": {"type": "string"},
            "description": (
                "List of information still needed. "
                "e.g. ['location', 'description']"
            ),
        },
        "needsClarification": {
            "type": "boolean",
            "description": (
                "True if the student's message is ambiguous or needs "
                "clarification (e.g. unclear location)."
            ),
        },
    },
    "required": [
        "reply",
        "issueReady",
        "titleEnglish",
        "descriptionEnglish",
        "category",
        "location",
        "campusZone",
        "locationStatus",
        "missingInformation",
        "needsClarification",
    ],
}


# ── System instruction ───────────────────────────────────────────────────

SYSTEM_INSTRUCTION = """\
You are SentraAI's intelligent campus issue reporting assistant. \
Your job is to help students report campus issues through natural conversation.

## CORE RULES

1. LANGUAGE: Always respond in the SAME language/style the student uses. \
If they speak Roman Urdu, respond in Roman Urdu. If English, respond in English. \
If they mix languages, you may naturally mix too. \
You understand ANY language — English, Urdu, Roman Urdu, Punjabi, Hindi, Arabic, \
and any other supported language.

2. INFORMATION COLLECTION: Intelligently determine what information is missing \
and ask for it. Collect at minimum:
   - Clear issue description (what is happening)
   - Location (which building, block, hostel, room, area)
   Do NOT ask for information the student already provided. \
   Do NOT ask unnecessary questions.

3. LOCATION IS CRITICAL: Location must match an EXISTING campus zone from the \
database. Use the get_campus_zones or find_matching_zones functions to verify. \
If no exact match exists, ask the student to clarify and show available options. \
Do NOT guess or invent locations.

4. ENGLISH ISSUE OUTPUT (CRITICAL): The titleEnglish and descriptionEnglish \
fields must ALWAYS be in PROFESSIONAL, FORMAL English — even when the student \
speaks Roman Urdu, Urdu, or any other language. \
NEVER copy the student's raw message into these fields. \
NEVER include non-English words in these fields. \
You must REWRITE the student's meaning into clean, professional English. \
\
TITLE RULES: 5-10 words, title case, concise summary. \
  GOOD: "Water Supply Issue in Block A" \
  GOOD: "Cleanliness Problem in Library Washroom" \
  GOOD: "AC Malfunction in Block B Classroom" \
  BAD: "There is no water supply in block a for two days" (too long, not title case) \
  BAD: "hostel mein pani nahi aa raha" (not English) \
  BAD: "Water Supply — There is no water supply in block a" (redundant) \
\
DESCRIPTION RULES: 1-2 professional sentences summarizing the issue. \
  GOOD: "No water supply in Block A for the past two days." \
  GOOD: "The student reports persistent cleanliness issues in the library washroom." \
  BAD: "mujhe ek problem report karni hai" (not English, not a description) \
  BAD: (copying the user's exact words verbatim)

5. DO NOT INVENT INFORMATION: Never add facts, dates, durations, severity, \
or details the student did not provide. Only use what they actually said.

6. PREVIEW WHEN READY: When you have enough information (clear description + \
location), set issueReady to true. The system will show a preview for the \
student to review. Include a message about Confirm & Submit, Edit, and Cancel.

7. CONVERSATION STYLE: Be friendly, helpful, and conversational — like a \
real AI assistant. Keep responses concise but warm.

8. CATEGORY: Match the issue to the most appropriate category from the \
available categories. Use the exact category name.

9. Keep your reply messages concise — 1-3 sentences for follow-up questions, \
and a brief confirmation message when the issue is ready.
"""


# ── Main entry point ─────────────────────────────────────────────────────

async def process_with_gemini(
    message: str,
    conversation: list[dict],
    extracted_fields: dict,
    categories: list[dict],
    zones: list[dict],
) -> dict | None:
    """Process a chatbot message using the Gemini LLM.

    Uses function calling (for zone/category lookup) and structured output
    (for reliable JSON response parsing).

    Args:
        message: The student's current message.
        conversation: Full conversation history [{role, content}].
        extracted_fields: Previously extracted fields from frontend state.
        categories: Active categories from the DB [{id, name, description}].
        zones: Active campus zones from the DB [{id, name, zone_type}].

    Returns:
        A dict matching ChatbotParseResponse fields, or None if Gemini
        is unavailable (caller should fall back to keyword-based service).
    """
    api_key = os.environ.get("GEMINI_API_KEY", "").strip()
    if not api_key:
        # Fallback: read from Settings (pydantic-settings loads .env
        # into the model but not into os.environ)
        from app.config import get_settings
        api_key = get_settings().gemini_api_key.strip()
    if not api_key:
        return None

    try:
        from google import genai
    except ImportError:
        logger.warning("google-genai SDK not installed; falling back to keyword chatbot")
        return None

    client = genai.Client(api_key=api_key)

    # Build zone/category context for the system instruction
    zone_context = _format_zones_for_prompt(zones)
    category_context = _format_categories_for_prompt(categories)

    full_system = (
        SYSTEM_INSTRUCTION
        + f"\n\n## AVAILABLE CAMPUS ZONES\n{zone_context}"
        + f"\n\n## AVAILABLE ISSUE CATEGORIES\n{category_context}"
    )

    # Build stateless conversation history for the Interactions API
    history: list[dict] = []
    for msg in conversation:
        if msg.get("role") == "user":
            history.append({
                "type": "user_input",
                "content": [{"type": "text", "text": msg["content"]}],
            })
        elif msg.get("role") == "bot":
            history.append({
                "type": "model_output",
                "content": [{"type": "text", "text": msg["content"]}],
            })

    # Append the current message if not already the last user_input
    if not history or history[-1].get("type") != "user_input" or \
       _get_text(history[-1]) != message:
        history.append({
            "type": "user_input",
            "content": [{"type": "text", "text": message}],
        })

    tools = _build_tool_declarations()

    try:
        # ── Phase 1: Call with function declarations ─────────────────
        # The model may call functions to look up zones or categories.
        interaction = await client.aio.interactions.create(
            model=GEMINI_MODEL,
            input=history,
            system_instruction=full_system,
            tools=tools,
            store=False,
        )

        # Check if the model made any function calls
        function_calls = [s for s in interaction.steps if s.type == "function_call"]

        if function_calls:
            # Append all model steps (thought, function_call) to history
            for step in interaction.steps:
                history.append(step.model_dump())

            # Execute each function call and append results
            for fc in function_calls:
                result = _execute_function(fc.name, fc.arguments, zones, categories)
                history.append({
                    "type": "function_result",
                    "name": fc.name,
                    "call_id": fc.id,
                    "result": [{"type": "text", "text": json.dumps(result)}],
                })

            # If there are multiple function calls, do one more round
            # to allow the model to process all results
            if len(function_calls) > 1:
                interaction2 = await client.aio.interactions.create(
                    model=GEMINI_MODEL,
                    input=history,
                    system_instruction=full_system,
                    tools=tools,
                    store=False,
                )
                fc2 = [s for s in interaction2.steps if s.type == "function_call"]
                if fc2:
                    for step in interaction2.steps:
                        history.append(step.model_dump())
                    for fc in fc2:
                        result = _execute_function(fc.name, fc.arguments, zones, categories)
                        history.append({
                            "type": "function_result",
                            "name": fc.name,
                            "call_id": fc.id,
                            "result": [{"type": "text", "text": json.dumps(result)}],
                        })
                else:
                    # Model produced text after function results
                    for step in interaction2.steps:
                        history.append(step.model_dump())

        # ── Phase 2: Get structured output ───────────────────────────
        # Use a FRESH single-prompt extraction so the model cannot
        # echo raw conversation text.  Collect user messages into a
        # summary and ask the model to produce professional English.
        user_msgs: list[str] = []
        for step in history:
            if step.get("type") == "user_input":
                txt = _get_text(step)
                # Skip our own extraction prompts
                if txt and not txt.startswith("A student reported"):
                    user_msgs.append(txt)

        # Also collect function results for DB-verified context
        fn_context: list[str] = []
        for step in history:
            if step.get("type") == "function_result":
                fn_context.append(str(step.get("result", "")))

        student_report = "\n".join(f"- {m}" for m in user_msgs)
        fn_info = "\n".join(fn_context) if fn_context else "No DB lookups performed."

        extraction_input = [{
            "type": "user_input",
            "content": [{"type": "text", "text": (
                f"A student reported the following issue(s):\n"
                f"{student_report}\n\n"
                f"Database lookup results:\n{fn_info}\n\n"
                f"Based ONLY on the above, produce a structured JSON response.\n"
                f"RULES:\n"
                f"- titleEnglish: SHORT professional title, 5-10 words, Title Case.\n"
                f"  Example: 'Water Supply Issue in Block A'\n"
                f"  Do NOT copy the student's words. REWRITE in formal English.\n"
                f"- descriptionEnglish: 1-2 formal English sentences summarizing.\n"
                f"  Do NOT copy student text. Produce a clean professional version.\n"
                f"- reply: A friendly message in the student's OWN language/style.\n"
                f"- All other fields based on what the student actually said."
            )}],
        }]

        extraction_system = (
            "You are a campus issue data extraction assistant. "
            "Given a student's report, produce structured JSON with "
            "professional English title/description. "
            "The titleEnglish and descriptionEnglish MUST be formal English — "
            "never copy raw student text (especially Roman Urdu/Urdu). "
            "The reply field should be in the student's own language."
        )

        final = await client.aio.interactions.create(
            model=GEMINI_MODEL,
            input=extraction_input,
            system_instruction=extraction_system,
            response_format={
                "type": "text",
                "mime_type": "application/json",
                "schema": RESPONSE_SCHEMA,
            },
            store=False,
        )

        output_text = final.output_text
        if not output_text:
            logger.warning("Gemini returned empty output")
            return None

        data = json.loads(output_text)

        # ── Map LLM output to ChatbotParseResult fields ─────────────
        return _build_result(data, categories, zones)

    except json.JSONDecodeError as exc:
        logger.warning("Gemini returned invalid JSON: %s", exc)
        return None
    except Exception as exc:
        logger.warning("Gemini API error: %s", exc)
        return None


# ── Helper: build ChatbotParseResult-compatible dict ─────────────────────

def _build_result(
    data: dict,
    categories: list[dict],
    zones: list[dict],
) -> dict:
    """Convert Gemini structured output to the chatbot response format."""
    reply = data.get("reply", "")
    issue_ready = bool(data.get("issueReady", False))
    title_en = data.get("titleEnglish", "") or ""
    desc_en = data.get("descriptionEnglish", "") or ""
    category_name = data.get("category", "") or ""
    campus_zone = data.get("campusZone", "") or ""
    location = data.get("location", "") or ""
    location_status = data.get("locationStatus", "missing")

    # Map category name → ID
    cat_id, cat_name = _match_category_name(category_name, categories)

    # Map zone name → ID
    zone_id, zone_name = _match_zone_name(campus_zone, zones)

    # If zone not found by campusZone, try the location field
    if not zone_id and location:
        zone_id, zone_name = _match_zone_name(location, zones)

    # Build fields dict
    fields = {
        "title": title_en if title_en else None,
        "description": desc_en if desc_en else None,
        "category_id": cat_id,
        "category_name": cat_name,
        "zone_id": zone_id,
        "zone_name": zone_name,
    }

    # Determine status and suggestions
    if issue_ready and title_en and desc_en:
        status = "ready"
        suggestions = ["Confirm & Submit", "Edit", "Cancel"]
    else:
        status = "conversing"
        suggestions = []
        # Provide zone suggestions if location is missing/ambiguous
        if location_status in ("missing", "ambiguous") and zones:
            suggestions = [z["name"] for z in zones[:6] if z.get("name")]

    return {
        "bot_message": reply,
        "fields": fields,
        "status": status,
        "suggestions": suggestions,
    }


# ── Function execution ───────────────────────────────────────────────────

def _execute_function(
    name: str,
    arguments: dict,
    zones: list[dict],
    categories: list[dict],
) -> dict:
    """Execute a backend function requested by Gemini.

    These are READ-ONLY functions that return data from the existing DB.
    """
    if name == "get_campus_zones":
        return {
            "zones": [
                {"id": z["id"], "name": z["name"], "type": z.get("zone_type", "")}
                for z in zones
            ]
        }

    elif name == "find_matching_zones":
        query = (arguments.get("query") or "").lower().strip()
        if not query:
            return {"matches": [], "message": "No query provided."}

        matches: list[dict] = []
        for z in zones:
            z_name = z.get("name", "")
            z_lower = z_name.lower()
            if query in z_lower or z_lower in query:
                matches.append({"id": z["id"], "name": z_name, "type": z.get("zone_type", "")})
                continue
            # Check partial words (e.g. "block a" matches "Block A")
            query_words = set(query.split())
            zone_words = set(z_lower.split())
            if query_words & zone_words:
                matches.append({"id": z["id"], "name": z_name, "type": z.get("zone_type", "")})

        if matches:
            return {"matches": matches}
        return {
            "matches": [],
            "message": (
                f"No campus zone found matching '{query}'. "
                f"Available zones: {', '.join(z['name'] for z in zones)}"
            ),
        }

    elif name == "get_categories":
        return {
            "categories": [
                {"id": c["id"], "name": c["name"]}
                for c in categories
            ]
        }

    return {"error": f"Unknown function: {name}"}


# ── Category / Zone name matching ────────────────────────────────────────

def _match_category_name(
    name: str, categories: list[dict]
) -> tuple[str | None, str | None]:
    """Match a category name from LLM output to the DB category."""
    if not name:
        return None, None
    name_lower = name.strip().lower()
    # Exact match first
    for cat in categories:
        if cat["name"].lower() == name_lower:
            return str(cat["id"]), cat["name"]
    # Partial match (LLM might return a shorter version)
    for cat in categories:
        cat_lower = cat["name"].lower()
        if name_lower in cat_lower or cat_lower in name_lower:
            return str(cat["id"]), cat["name"]
    return None, None


def _match_zone_name(
    name: str, zones: list[dict]
) -> tuple[str | None, str | None]:
    """Match a zone name from LLM output to the DB zone."""
    if not name:
        return None, None
    name_lower = name.strip().lower()
    # Exact match first
    for z in zones:
        if z["name"].lower() == name_lower:
            return str(z["id"]), z["name"]
    # Partial match
    for z in zones:
        z_lower = z["name"].lower()
        if name_lower in z_lower or z_lower in name_lower:
            return str(z["id"]), z["name"]
    # Word-level match
    name_words = set(name_lower.split())
    for z in zones:
        zone_words = set(z["name"].lower().split())
        if name_words & zone_words:
            return str(z["id"]), z["name"]
    return None, None


# ── Prompt formatting helpers ────────────────────────────────────────────

def _format_zones_for_prompt(zones: list[dict]) -> str:
    """Format zone list for the system instruction."""
    if not zones:
        return "No campus zones available."
    parts = []
    for z in zones:
        z_type = z.get("zone_type", "")
        parts.append(f"- {z['name']} ({z_type})" if z_type else f"- {z['name']}")
    return "\n".join(parts)


def _format_categories_for_prompt(categories: list[dict]) -> str:
    """Format category list for the system instruction."""
    if not categories:
        return "No categories available."
    return "\n".join(f"- {c['name']}" for c in categories)


# ── Utility ──────────────────────────────────────────────────────────────

def _get_text(history_entry: dict) -> str:
    """Extract text content from a history entry."""
    content = history_entry.get("content", "")
    if isinstance(content, list):
        for item in content:
            if isinstance(item, dict) and item.get("type") == "text":
                return item.get("text", "")
    return str(content)
