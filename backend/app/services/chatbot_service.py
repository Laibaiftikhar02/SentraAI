"""AI Reporting Chatbot service — conversational issue extraction.

Helps students report issues through natural conversation in English,
Urdu, and Roman Urdu.  Extracts structured fields (title, description,
category, zone) and asks follow-up questions when information is missing.

This service is purely additive — it does NOT replace the existing
SentraAI AI pipeline (LocalAIProvider).  Once the student confirms the
structured issue, the EXISTING complaint submission API processes it.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from uuid import UUID


# ── Roman Urdu → English keyword dictionary ────────────────────────────────
# Maps common Urdu/Roman Urdu words to English equivalents grouped by topic.
_ROMAN_URDU_MAP: dict[str, str] = {
    # Water
    "pani": "water", "paani": "water", "nal": "tap", "naal": "drain",
    "sewage": "sewage", "gatar": "drain", "nalka": "tap",
    "supply": "supply", "tanki": "tank",
    # Electricity
    "bijli": "electricity", "light": "light", "current": "current",
    "fan": "fan", " pankha": "fan", "ac": "ac", "air conditioner": "ac",
    "generator": "generator", "ups": "ups", "socket": "socket",
    "switch": "switch", "wiring": "wiring", "load shedding": "power outage",
    # Cleanliness
    "ganda": "dirty", "gandagi": "garbage", "safai": "cleaning",
    "kachra": "trash", "dustbin": "dustbin", "koora": "garbage",
    "badboo": "smell", "boo": "odor", "gand": "dirty",
    "dhona": "washing", "washroom": "washroom", "toilet": "toilet",
    "bathroom": "bathroom",
    # Infrastructure
    "kharab": "broken", "toota": "broken", "tuta": "broken",
    "damage": "damage", "deewar": "wall", "darwaza": "door",
    "khirki": "window", "chhat": "roof", "farsh": "floor",
    "seerhi": "stairs", "lift": "elevator", "chair": "chair",
    "desk": "desk", "table": "table", "bed": "bed",
    "mattress": "mattress", "gadda": "mattress",
    # Hostel / Location
    "hostel": "hostel", "room": "room", "block": "block",
    "wing": "wing", "floor": "floor", "manzil": "floor",
    "corridor": "corridor", "lobby": "lobby", "hall": "hall",
    "library": "library", "canteen": "canteen", "cafeteria": "cafeteria",
    "masjid": "mosque", "parking": "parking", "ground": "ground",
    "sports": "sports", "lab": "lab", "laboratory": "laboratory",
    # Academic
    "class": "class", "lecture": "lecture", "exam": "exam",
    "imtihaan": "exam", "teacher": "teacher", "ustad": "teacher",
    "course": "course", "assignment": "assignment", "grade": "grade",
    "number": "marks", "result": "result", "registration": "registration",
    # Security
    "chori": "theft", "chour": "thief", "security": "security",
    "guard": "guard", "pahra": "security", "darwaza": "door",
    "cctv": "cctv", "camera": "camera", "harassment": "harassment",
    "tang": "harassment", "bullying": "bullying",
    # Fire / Emergency
    "aag": "fire", "emergency": "emergency", "khatra": "danger",
    "dhuan": "smoke", "hadsa": "accident",
    # General verbs / descriptors
    "nahi": "not", "ni": "not", "nhi": "not",
    "aa raha": "coming", "ja raha": "going",
    "kharab hai": "broken", "band": "not working", "chal nahi": "not working",
    "kaam nahi": "not working", "masla": "problem", "mushkil": "problem",
    "shikayat": "complaint", "takleef": "problem",
    "chal": "working", "chalna": "working", "mera": "my", "meri": "my", "mere": "my",
    "aapka": "your", "aapki": "your", "aapke": "your",
    "din": "days", "hafta": "week", "mahina": "month",
    "raat": "night", "subah": "morning", "shaam": "evening",
    "bohat": "very", "zyada": "very", "thora": "little",
    "mein": "in", "par": "on", "ka": "of", "ki": "of", "ke": "of",
    "hai": "is", "hain": "are", "tha": "was", "thi": "was",
    "ho raha": "happening", "ho gayi": "happened",
}

# ── Category keyword mapping ───────────────────────────────────────────────
# Maps category names to trigger keywords (extends existing LocalAIProvider
# keywords with Roman Urdu terms).
_CHATBOT_CATEGORY_KEYWORDS: dict[str, list[str]] = {
    "Network / Internet": [
        "wifi", "internet", "network", "connection", "online", "router",
        "bandwidth", "cable", "ethernet", "dns",
        # Roman Urdu
        "net", "internet nahi", "wifi nahi", "signal",
    ],
    "Computer / Hardware": [
        "computer", "laptop", "desktop", "monitor", "screen", "keyboard",
        "mouse", "printer", "projector", "hardware",
    ],
    "Software / Portal": [
        "software", "portal", "website", "app", "application", "login",
        "password", "system", "error", "crash", "bug",
        # Roman Urdu
        "site", "page", "upload nahi", "open nahi",
    ],
    "Water Supply": [
        "water", "tap", "pipe", "leak", "plumbing", "drinking",
        "sewage", "drain", "overflow", "no water",
        # Roman Urdu
        "pani", "paani", "nal", "naal", "tanki", "supply nahi",
        "pani nahi", "pani nahi",
    ],
    "Electricity / Power": [
        "electricity", "power", "light", "fan", "outage", "voltage",
        "switch", "socket", "generator", "ups",
        # Roman Urdu
        "bijli", "current", "load shedding", "light nahi",
        "fan nahi", "ac kharab", "bijli nahi",
    ],
    "Cleanliness / Sanitation": [
        "clean", "dirty", "garbage", "trash", "dustbin", "toilet",
        "bathroom", "sanitation", "hygiene", "smell", "odor",
        # Roman Urdu
        "ganda", "gandagi", "safai", "kachra", "koora", "badboo",
        "washroom ganda", "gand", "sweeping",
    ],
    "Furniture / Infrastructure": [
        "furniture", "chair", "desk", "table", "bed", "mattress",
        "broken", "damage", "shelf", "door", "window",
        # Roman Urdu
        "kharab", "toota", "tuta", "deewar", "darwaza", "khirki",
        "gadda", "seerhi", "lift", "fracture", "crack",
    ],
    "Fire / Safety Emergency": [
        "fire", "emergency", "danger", "safety", "smoke", "burn",
        "evacuation", "life threatening", "hazard", "alarm",
        # Roman Urdu
        "aag", "khatra", "dhuan", "hadsa",
    ],
    "Theft / Security": [
        "theft", "stolen", "robbery", "intruder", "cctv", "security",
        "threat", "assault", "harassment", "bullying", "violence",
        # Roman Urdu
        "chori", "chour", "tang", "pahra",
    ],
    "Unauthorized Access": [
        "unauthorized", "trespass", "break-in", "access", "intrusion",
    ],
    "Hostel Complaint": [
        "hostel", "room", "warden", "mess", "food quality", "laundry",
        "accommodation", "roommate", "noise",
        # Roman Urdu
        "khana", "food kharab", "roommate", "shor",
    ],
    "Academic Issue": [
        "exam", "course", "lecture", "professor", "grade", "assignment",
        "timetable", "schedule", "registration", "enrollment", "class",
        # Roman Urdu
        "imtihaan", "ustad", "number", "result", "syllabus",
    ],
    "Discipline / Conduct": [
        "discipline", "conduct", "behavior", "misconduct", "ragging",
    ],
    "Fee / Payment": [
        "bill", "fee", "payment", "charge", "invoice", "tuition",
        "overcharge", "tax",
        # Roman Urdu
        "paisa", "fisa", "paise", "challan",
    ],
    "Scholarship": [
        "scholarship", "financial aid", "grant", "stipend",
    ],
    "Refund": [
        "refund", "reimbursement", "money back",
        # Roman Urdu
        "wapas", "paisa wapas", "refund nahi",
    ],
}


# ── Data class for parse result ────────────────────────────────────────────

@dataclass
class ChatbotParseResult:
    bot_message: str
    fields: dict  # {title, description, category_id, category_name, zone_id, zone_name}
    status: str   # "conversing" | "ready"
    suggestions: list[str] = field(default_factory=list)


# ── Utility helpers ─────────────────────────────────────────────────────────

def _normalize(text: str) -> str:
    """Lowercase and normalize whitespace."""
    return re.sub(r"\s+", " ", text.strip().lower())


def _translate_urdu(text: str) -> str:
    """Replace known Roman Urdu words with English equivalents.

    Processes longer phrases first to avoid partial matches.
    """
    normalized = _normalize(text)
    # Sort by length descending so longer phrases match first
    sorted_terms = sorted(_ROMAN_URDU_MAP.keys(), key=len, reverse=True)
    result = normalized
    for urdu_term in sorted_terms:
        english = _ROMAN_URDU_MAP[urdu_term]
        # Only replace if the English equivalent is different
        if urdu_term.strip() != english:
            # Use word boundary matching for single words, simple replace for phrases
            if " " in urdu_term:
                result = result.replace(urdu_term.strip(), english)
            else:
                result = re.sub(
                    rf"\b{re.escape(urdu_term.strip())}\b",
                    english,
                    result,
                )
    return result


# ── English phrase translation ─────────────────────────────────────────────
# Maps common Roman Urdu phrases/sentences to English for issue generation.
_ENGLISH_PHRASE_MAP: dict[str, str] = {
    # Water / Plumbing
    "pani nahi aa raha": "no water supply",
    "paani nahi aa raha": "no water supply",
    "pani nahi aata": "no water supply",
    "pani ka masla": "water supply problem",
    "pani leak ho raha": "water leaking",
    "nal kharab": "tap broken",
    "nalka kharab": "tap broken",
    "tanki khaali": "tank empty",
    "sewage overflow": "sewage overflow",
    "naal band": "drain blocked",
    # Electricity
    "bijli nahi aa rahi": "no electricity",
    "bijli nahi hai": "no electricity",
    "light nahi hai": "no light",
    "fan nahi chal raha": "fan not working",
    "ac kharab hai": "AC not working",
    "ac kaam nahi kar raha": "AC not working",
    "current nahi aa raha": "no electricity",
    "load shedding ho rahi": "power outage",
    "socket kaam nahi kar raha": "socket not working",
    "switch kharab": "switch broken",
    # Cleanliness
    "washroom ganda hai": "washroom is dirty",
    "washroom bohat ganda": "washroom very dirty",
    "bathroom ganda hai": "bathroom is dirty",
    "gandagi bohat hai": "too much garbage",
    "kachra nahi uthaya": "trash not collected",
    "safai nahi hoti": "no cleaning done",
    "badboo aa rahi hai": "foul smell",
    "koora bhara hai": "garbage piled up",
    # Infrastructure
    "chair toot gayi": "chair broken",
    "chair tooti hui hai": "chair broken",
    "desk toota hai": "desk broken",
    "darwaza kharab hai": "door broken",
    "khirki toot gayi": "window broken",
    "deewar mein crack": "crack in wall",
    "farsh toota hai": "floor broken",
    "lift kaam nahi kar rahi": "elevator not working",
    "gadda kharab hai": "mattress damaged",
    # Hostel / Food
    "khana kharab hai": "food quality poor",
    "khane ki quality": "food quality issue",
    "shor bohat hai": "too much noise",
    "roommate ka masla": "roommate issue",
    # Security
    "chori ho gayi": "theft occurred",
    "cheez chori ho gayi": "item was stolen",
    "tang kar raha hai": "being harassed",
    # Fire / Emergency
    "aag lag gayi": "fire broke out",
    "dhuan aa raha hai": "smoke detected",
    # Time / Duration
    "do din se": "for two days",
    "do din": "two days",
    "teen din se": "for three days",
    "teen din": "three days",
    "ek din": "one day",
    "ek hafte se": "for a week",
    "ek hafta": "one week",
    "kai din se": "for several days",
    "kai din": "several days",
    "aaj se": "since today",
    "kal se": "since yesterday",
    "bohat din se": "for many days",
    "bohat din": "many days",
    "kaafi din se": "for quite a few days",
    "kaafi din": "quite a few days",
    "do hafte se": "for two weeks",
    "do hafte": "two weeks",
    "do ghante se": "for two hours",
    "do ghante": "two hours",
    # Negation / State
    "kaam nahi kar raha": "not working",
    "chal nahi raha": "not working",
    "band hai": "not working",
    "kharab ho gaya hai": "has broken down",
    "kharab ho gayi hai": "has broken down",
    "ho gaya hai": "has occurred",
    "ho gayi hai": "has occurred",
    # Common verbs / connectors
    "mujhe report karna hai": "I want to report",
    "meri complaint hai": "my complaint is",
    "mujhe shikayat hai": "I have a complaint",
    "please madad karein": "please help",
    "meri madad karein": "please help me",
}

# Urdu filler words to remove from English translation output
_URDU_FILLERS: list[str] = [
    "hai", "hain", "tha", "thi", "raha", "rahi", "rahe",
    "gayi", "gaya", "gaye", "bohat", "zyada", "thora",
    "bhi", "toh", "phir", "aur", "mein", "par", "ka", "ki", "ke",
    "ko", "se", "ne", "ye", "wo", "jo",
    "aa", "ho", "ja", "jaa", "baar", "bas", "abhi", "kuch",
]


def _translate_to_english(text: str) -> str:
    """Translate Roman Urdu text to English for the registered issue.

    Uses a token-based approach: processes multi-word phrases first
    to prevent individual words from being mistranslated, then
    translates remaining tokens, and finally removes filler particles.
    """
    normalized = _normalize(text)

    # Step 1: Replace multi-word phrases (longest first) at the token level.
    # This ensures "pani nahi aa raha" → "no water supply" is applied
    # BEFORE individual words like "nahi" → "not" break the phrase.
    tokens = normalized.split()
    sorted_phrases = sorted(
        [(k, v) for k, v in _ENGLISH_PHRASE_MAP.items() if " " in k and k.strip() != v],
        key=lambda x: len(x[0].split()),
        reverse=True,
    )
    for phrase, english in sorted_phrases:
        phrase_tokens = phrase.split()
        n = len(phrase_tokens)
        new_tokens: list[str] = []
        i = 0
        while i < len(tokens):
            if (
                i + n <= len(tokens)
                and tokens[i : i + n] == phrase_tokens
            ):
                new_tokens.append(english)
                i += n
            else:
                new_tokens.append(tokens[i])
                i += 1
        tokens = new_tokens

    # Step 2: Remove Urdu filler particles BEFORE translating remaining tokens.
    # This prevents fillers like "mein" from becoming "in" and surviving cleanup.
    tokens = [t for t in tokens if t not in _URDU_FILLERS]

    # Step 3: Translate remaining individual tokens via _ROMAN_URDU_MAP
    tokens = [_ROMAN_URDU_MAP.get(t, t) for t in tokens]

    # Step 4: Collapse whitespace
    result = " ".join(tokens) if tokens else ""
    result = re.sub(r"\s+", " ", result).strip()
    return result


def _detect_language(text: str) -> str:
    """Detect if text is primarily English, Roman Urdu, or mixed.

    Returns 'english', 'roman_urdu', or 'mixed'.
    """
    normalized = _normalize(text)
    words = normalized.split()
    if not words:
        return "english"

    # Only count words that are genuinely Urdu (map to a different English word).
    # Words like "hostel" → "hostel" are English loanwords used in Roman Urdu
    # and should not count as Urdu indicators.
    urdu_only_words = {k for k, v in _ROMAN_URDU_MAP.items() if k.strip() != v}
    urdu_score = sum(1 for w in words if w in urdu_only_words)
    common_english = {
        # Articles, determiners, quantifiers
        "the", "a", "an", "this", "that", "these", "those", "my", "your",
        "our", "their", "its", "no", "not", "some", "any", "all", "each",
        "every", "more", "most", "many", "much", "few", "other",
        # Prepositions
        "in", "on", "at", "to", "for", "of", "with", "from", "by", "as",
        "into", "about", "between", "through", "during", "without",
        "after", "before", "above", "below", "near", "since",
        # Conjunctions
        "and", "but", "or", "if", "because", "while", "when", "where",
        # Pronouns
        "i", "you", "he", "she", "it", "we", "they", "me", "him", "her",
        "us", "them", "what", "which", "who",
        # Common verbs
        "is", "are", "was", "were", "be", "been", "being", "have", "has",
        "had", "do", "does", "did", "can", "could", "will", "would",
        "shall", "should", "may", "might", "must",
        "there", "here", "than", "also", "very", "just", "only",
        # Common nouns / adjectives (unambiguous English)
        "broken", "working", "issue", "problem", "report", "water",
        "days", "area", "building", "room",
    }
    english_score = sum(1 for w in words if w in common_english)
    total = len(words)

    if urdu_score >= total * 0.25 and urdu_score > english_score:
        return "roman_urdu"
    if english_score >= total * 0.4:
        return "english"
    return "mixed"


def _build_followup(followup_type: str, lang: str, zones: list[dict] | None = None) -> tuple[str, list[str]]:
    """Build a language-aware follow-up question.  Returns (message, suggestions)."""
    zone_names = [z.get("name", "") for z in (zones or [])[:6] if z.get("name")]

    responses = {
        "need_description": {
            "roman_urdu": (
                "Thoda aur detail mein batayein? Maslan kya ho raha hai aur kab se?",
                ["Detail batayein..."],
            ),
            "english": (
                "Could you describe the issue in a bit more detail? "
                "For example, what exactly is happening and since when?",
                ["Describe the issue..."],
            ),
        },
        "need_location": {
            "roman_urdu": (
                "Ye kis hostel, block ya area mein ho raha hai?",
                zone_names if zone_names else ["Block A", "Hostel Wing 1", "Library"],
            ),
            "english": (
                "Which building, block, hostel, or campus area is affected?",
                zone_names if zone_names else ["Block A", "Hostel Wing 1", "Library"],
            ),
        },
        "need_category": {
            "roman_urdu": (
                "Ye kis type ka masla hai? Maslan: pani ki supply, bijli, safai, ya koi aur?",
                ["Water Supply", "Electricity", "Cleanliness", "Infrastructure"],
            ),
            "english": (
                "What type of issue is this? For example: water supply, electricity, "
                "cleanliness, infrastructure, or something else?",
                ["Water Supply", "Electricity", "Cleanliness", "Infrastructure"],
            ),
        },
        "need_more_detail": {
            "roman_urdu": (
                "Shukriya. Kya aap thoda aur detail bata sakte hain taake main sahi report bana sakoon?",
                ["Aur detail batayein..."],
            ),
            "english": (
                "Thanks for the details. Could you add a little more information "
                "about what's happening so I can prepare an accurate report?",
                ["Add more details..."],
            ),
        },
    }

    lang_key = "roman_urdu" if lang in ("roman_urdu", "mixed") else "english"
    msg, sug = responses[followup_type][lang_key]
    return msg, sug


def _build_preview_message(lang: str, followup_count: int, fields: dict) -> str:
    """Build a language-aware preview message."""
    lang_key = "roman_urdu" if lang in ("roman_urdu", "mixed") else "english"

    if followup_count >= 3:
        msgs = {
            "roman_urdu": (
                "Mujhe itni information mil gayi hai. Main aapki report taiyaar kar raha hoon. "
                "Aap **Confirm & Submit** kar sakte hain, **Edit** kar sakte hain, ya **Cancel** karein:"
            ),
            "english": (
                "Let me prepare your report with the information available. "
                "Please review and **Confirm & Submit**, or **Edit** to add more details:"
            ),
        }
    else:
        msgs = {
            "roman_urdu": (
                "Samajh gaya. Main ne aapki report taiyaar kar li hai. "
                "Barah-e-karam check karein aur **Confirm & Submit**, "
                "**Edit**, ya **Cancel** dabayein:"
            ),
            "english": (
                "Here's what I understood from your report. "
                "Please review and **Confirm & Submit**, **Edit** any field, or **Cancel** to go back:"
            ),
        }
    return msgs[lang_key]


def _build_combined_text(
    message: str,
    conversation: list[dict],
    translated: str,
) -> str:
    """Build a combined text from the message, translated text, and conversation."""
    parts = [translated]
    # Also include original message for proper nouns / unmatched terms
    if _normalize(message) != translated:
        parts.append(_normalize(message))
    # Include user messages from conversation for context
    for msg in conversation:
        if msg.get("role") == "user":
            user_text = _normalize(msg.get("content", ""))
            user_translated = _translate_urdu(msg.get("content", ""))
            if user_text not in parts:
                parts.append(user_text)
            if user_translated not in parts:
                parts.append(user_translated)
    return " ".join(parts)


def _match_category(
    combined_text: str,
    categories: list[dict],
) -> tuple[str | None, str | None]:
    """Match text to the best category.  Returns (category_id, category_name)."""
    text_lower = combined_text.lower()
    best_id: str | None = None
    best_name: str | None = None
    best_score = 0

    for cat in categories:
        cat_name = cat.get("name", "")
        matched = 0

        # Check category name in text
        if cat_name.lower() in text_lower:
            matched += 5

        # Check keyword dictionary
        keywords = _CHATBOT_CATEGORY_KEYWORDS.get(cat_name, [])
        for kw in keywords:
            if kw in text_lower:
                matched += 1

        if matched > best_score:
            best_score = matched
            best_id = str(cat.get("id", ""))
            best_name = cat_name

    return (best_id, best_name) if best_score > 0 else (None, None)


def _match_zone(
    combined_text: str,
    zones: list[dict],
) -> tuple[str | None, str | None]:
    """Match text to a campus zone by name.  Returns (zone_id, zone_name)."""
    text_lower = combined_text.lower()
    for zone in zones:
        zone_name = zone.get("name", "")
        if zone_name.lower() in text_lower:
            return str(zone.get("id", "")), zone_name
    # Also try common aliases — but only use aliases that are UNIQUE to one zone.
    # Generic aliases like "hostel" (shared by Hostel Wing 1 and Wing 2) are
    # skipped to avoid false matches; the student must specify which hostel.
    zone_aliases: dict[str, list[str]] = {}
    for zone in zones:
        zone_name = zone.get("name", "")
        aliases: list[str] = []
        # Add common variations (excluding the full zone name already checked)
        if "block" in zone_name.lower():
            part = zone_name.lower().replace("block", "").strip()
            if part and len(part) >= 3:
                aliases.append(part)
        if "wing" in zone_name.lower():
            part = zone_name.lower().replace("wing", "").strip()
            if part and len(part) >= 3:
                aliases.append(part)
        zone_aliases[str(zone.get("id", ""))] = aliases

    # Count how many zones share each alias
    alias_counts: dict[str, int] = {}
    for aliases in zone_aliases.values():
        for alias in aliases:
            alias_counts[alias] = alias_counts.get(alias, 0) + 1

    # Only match on aliases that are unique to a single zone
    for zone_id, aliases in zone_aliases.items():
        for alias in aliases:
            if alias_counts.get(alias, 0) == 1 and alias in text_lower:
                zone = next(
                    (z for z in zones if str(z.get("id", "")) == zone_id),
                    None,
                )
                if zone:
                    return zone_id, zone.get("name", "")
    return None, None


def _extract_english_title(
    message: str,
    conversation: list[dict],
    category_name: str | None = None,
) -> str:
    """Generate a professional English complaint title from the user's message.

    Translates Roman Urdu to English, removes filler phrases, and produces
    a concise Title Case summary suitable for an issue tracking system.
    """
    first_user_msg = message
    for msg in conversation:
        if msg.get("role") == "user":
            first_user_msg = msg["content"]
            break

    # Translate to English
    title = _translate_to_english(first_user_msg)

    # Remove common filler phrases (both English and translated Urdu)
    for filler in [
        "meri complaint hai", "mujhe shikayat hai", "i want to report",
        "i have a problem", "meri shikayat", "mujhe problem hai",
        "please help", "meri madad", "help me", "i want to report",
        "my complaint is", "i have a complaint", "please help me",
        "there is", "there are", "i would like to report",
        "i need to report", "i am reporting",
    ]:
        title = re.sub(re.escape(filler), "", title, flags=re.IGNORECASE).strip()

    # Clean up leading/trailing punctuation artifacts
    title = re.sub(r"^[.,;:\-\s]+|[.,;:\-\s]+$", "", title).strip()

    # Apply Title Case for a professional look
    if title:
        title = title.title()
        # Lowercase minor words that shouldn't be capitalised in Title Case
        _minor = {"a", "an", "the", "and", "but", "or", "for", "nor",
                  "on", "at", "to", "from", "by", "in", "of", "is",
                  "it", "no", "not", "as", "if"}
        words = title.split()
        title = " ".join(
            w.lower() if (i > 0 and w.lower() in _minor and len(w) > 1) else w
            for i, w in enumerate(words)
        )

    # Enhance with category context if available
    if category_name and title:
        # Check if any significant word from the category name appears as a
        # standalone word in the title (avoids false substring matches like
        # "water supply" inside "no water supply for two days").
        title_words = set(title.lower().split())
        cat_words = {w for w in category_name.lower().split() if len(w) > 3}
        if not (cat_words & title_words):
            title = f"{category_name} Issue — {title}"

    # Truncate to 500 chars
    if len(title) > 500:
        title = title[:497] + "..."

    return title


def _build_description(
    conversation: list[dict],
    current_message: str,
) -> str:
    """Build a description from the full conversation transcript."""
    user_messages: list[str] = []
    for msg in conversation:
        if msg.get("role") == "user":
            user_messages.append(msg["content"].strip())
    # Include the current message if not already in conversation
    current = current_message.strip()
    if current and current not in user_messages:
        user_messages.append(current)

    if not user_messages:
        return ""

    description = ". ".join(user_messages)
    # Truncate to 10000 chars
    if len(description) > 10000:
        description = description[:9997] + "..."

    return description


def _count_followups(conversation: list[dict]) -> int:
    """Count how many bot follow-up questions have been asked."""
    return sum(1 for msg in conversation if msg.get("role") == "bot")


# ── Main parse function ────────────────────────────────────────────────────

def _build_english_description(
    conversation: list[dict],
    current_message: str,
    zone_name: str | None = None,
) -> str:
    """Build an English description by translating all user messages.

    Short follow-up messages (e.g. just a location name) are excluded
    to keep the description clean.  The zone is appended separately.
    """
    user_messages: list[str] = []
    for msg in conversation:
        if msg.get("role") == "user":
            content = msg["content"].strip()
            # Skip very short follow-up messages (likely just a location/answer)
            if len(content) < 15 and len(user_messages) > 0:
                continue
            translated = _translate_to_english(content)
            if translated:
                user_messages.append(translated)

    # Include current message if not already in conversation
    current = current_message.strip()
    current_translated = _translate_to_english(current)
    if current_translated and current_translated not in user_messages:
        # Skip very short follow-up messages (likely just a location/answer)
        if len(current) >= 15 or len(user_messages) == 0:
            user_messages.append(current_translated)

    if not user_messages:
        return ""

    description = ". ".join(user_messages)
    if description:
        description = description[0].upper() + description[1:]

    # Append zone name as a clean location reference
    if zone_name and zone_name.lower() not in description.lower():
        description += f". Location: {zone_name}"

    # Truncate to 10000 chars
    if len(description) > 10000:
        description = description[:9997] + "..."

    return description


# ── Main parse function ────────────────────────────────────────────────────

def parse_chatbot_message(
    message: str,
    conversation: list[dict],
    extracted_fields: dict,
    categories: list[dict],
    zones: list[dict],
) -> ChatbotParseResult:
    """Parse a chatbot message and extract/update issue fields.

    The bot responds in the student's language (English, Roman Urdu, or mixed).
    The registered issue title and description are ALWAYS in English.

    Args:
        message: The student's current message.
        conversation: Full conversation history [{role, content}].
        extracted_fields: Previously extracted fields from frontend state.
        categories: Active categories from the DB [{id, name, description}].
        zones: Active campus zones from the DB [{id, name, zone_type}].

    Returns:
        ChatbotParseResult with bot_message, updated fields, status, suggestions.
    """
    # Detect student's language from all user messages
    all_user_text = " ".join(
        msg.get("content", "") for msg in conversation if msg.get("role") == "user"
    ) + " " + message
    lang = _detect_language(all_user_text)

    # Translate Roman Urdu to English (for matching)
    translated = _translate_urdu(message)

    # Build combined text from current message + conversation context
    combined_text = _build_combined_text(message, conversation, translated)

    # Start with previously extracted fields
    fields = {
        "title": extracted_fields.get("title"),
        "description": extracted_fields.get("description"),
        "category_id": extracted_fields.get("category_id"),
        "category_name": extracted_fields.get("category_name"),
        "zone_id": extracted_fields.get("zone_id"),
        "zone_name": extracted_fields.get("zone_name"),
    }

    # Match category FIRST so it can be used to enhance the title
    if not fields["category_id"] and categories:
        cat_id, cat_name = _match_category(combined_text, categories)
        if cat_id:
            fields["category_id"] = cat_id
            fields["category_name"] = cat_name

    # Match zone if not yet set
    if not fields["zone_id"] and zones:
        zone_id, zone_name = _match_zone(combined_text, zones)
        if zone_id:
            fields["zone_id"] = zone_id
            fields["zone_name"] = zone_name

    # Extract ENGLISH title if not yet set (with category context)
    if not fields["title"]:
        fields["title"] = _extract_english_title(
            message, conversation, category_name=fields.get("category_name")
        )

    # Build ENGLISH description from all user messages
    description = _build_english_description(conversation, message)
    if description:
        fields["description"] = description

    # Append zone to description if not already present
    if fields["zone_name"] and description and fields["zone_name"].lower() not in description.lower():
        fields["description"] = description + f". Location: {fields['zone_name']}"

    # Determine what's missing and decide status
    has_title = bool(fields.get("title") and len(fields["title"]) >= 5)
    has_description = bool(fields.get("description") and len(fields["description"]) >= 10)

    followup_count = _count_followups(conversation)
    max_followups = 3

    # Check if we have enough to present a preview
    if has_title and has_description:
        # If location is missing and we haven't hit max follow-ups, ask for it first.
        # Location is important for routing the complaint to the right department.
        if not fields.get("zone_id") and followup_count < max_followups:
            bot_msg, suggestions = _build_followup("need_location", lang, zones)
            return ChatbotParseResult(
                bot_message=bot_msg,
                fields=fields,
                status="conversing",
                suggestions=suggestions,
            )

        # Build language-aware preview message
        preview_msg = _build_preview_message(lang, followup_count, fields)
        preview_parts = [preview_msg, ""]

        return ChatbotParseResult(
            bot_message="\n".join(preview_parts),
            fields=fields,
            status="ready",
            suggestions=["Confirm & Submit", "Edit", "Cancel"],
        )

    # Still need more information — ask a follow-up
    if followup_count >= max_followups:
        # Max follow-ups reached — present what we have
        preview_msg = _build_preview_message(lang, followup_count, fields)
        preview_parts = [preview_msg, ""]

        # Ensure minimum fields
        if not fields["title"]:
            fields["title"] = _translate_to_english(message)[:100] or message[:100]
        if not fields["description"]:
            fields["description"] = _translate_to_english(message) or message

        return ChatbotParseResult(
            bot_message="\n".join(preview_parts),
            fields=fields,
            status="ready",
            suggestions=["Confirm & Submit", "Edit", "Cancel"],
        )

    # Determine what to ask about (language-aware)
    if not has_description or (has_title and len(fields.get("description", "")) < 30):
        bot_msg, suggestions = _build_followup("need_description", lang)
    elif not fields.get("zone_id"):
        bot_msg, suggestions = _build_followup("need_location", lang, zones)
    elif not fields.get("category_id"):
        bot_msg, suggestions = _build_followup("need_category", lang)
    else:
        bot_msg, suggestions = _build_followup("need_more_detail", lang)

    return ChatbotParseResult(
        bot_message=bot_msg,
        fields=fields,
        status="conversing",
        suggestions=suggestions,
    )
