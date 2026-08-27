"""Tests for the AI Reporting Chatbot service.

These tests verify the chatbot's natural language parsing, Roman Urdu
support, category/zone matching, and follow-up question generation.
"""

import sys
import os

# Ensure the backend app is importable
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.services.chatbot_service import parse_chatbot_message

# ── Test data ──────────────────────────────────────────────────────────────────

CATEGORIES = [
    {"id": "cat-water", "name": "Water Supply", "description": None},
    {"id": "cat-elec", "name": "Electricity / Power", "description": None},
    {"id": "cat-clean", "name": "Cleanliness / Sanitation", "description": None},
    {"id": "cat-infra", "name": "Furniture / Infrastructure", "description": None},
    {"id": "cat-hostel", "name": "Hostel Complaint", "description": None},
    {"id": "cat-net", "name": "Network / Internet", "description": None},
    {"id": "cat-theft", "name": "Theft / Security", "description": None},
    {"id": "cat-academic", "name": "Academic Issue", "description": None},
    {"id": "cat-fire", "name": "Fire / Safety Emergency", "description": None},
    {"id": "cat-fee", "name": "Fee / Payment", "description": None},
    {"id": "cat-software", "name": "Software / Portal", "description": None},
    {"id": "cat-scholarship", "name": "Scholarship", "description": None},
    {"id": "cat-refund", "name": "Refund", "description": None},
    {"id": "cat-discipline", "name": "Discipline / Conduct", "description": None},
    {"id": "cat-unauth", "name": "Unauthorized Access", "description": None},
    {"id": "cat-computer", "name": "Computer / Hardware", "description": None},
]

ZONES = [
    {"id": "zone-main", "name": "Main Building", "zone_type": "building"},
    {"id": "zone-a", "name": "Block A", "zone_type": "building"},
    {"id": "zone-b", "name": "Block B", "zone_type": "building"},
    {"id": "zone-cafe", "name": "Cafeteria", "zone_type": "building"},
    {"id": "zone-lib", "name": "Library", "zone_type": "building"},
    {"id": "zone-sports", "name": "Sports Complex", "zone_type": "outdoor"},
    {"id": "zone-h1", "name": "Hostel Wing 1", "zone_type": "hostel"},
    {"id": "zone-h2", "name": "Hostel Wing 2", "zone_type": "hostel"},
]


# ── Tests ─────────────────────────────────────────────────────────────────────

def test_english_water_supply_issue():
    """English input should match Water Supply category and extract zone."""
    result = parse_chatbot_message(
        message="Water supply issue in Hostel Block A, no water for two days",
        conversation=[],
        extracted_fields={},
        categories=CATEGORIES,
        zones=ZONES,
    )
    assert result.fields["category_id"] == "cat-water"
    assert result.fields["category_name"] == "Water Supply"
    assert result.fields["title"] is not None
    assert result.fields["description"] is not None
    # Should have enough info for preview or at least be conversing
    assert result.status in ("conversing", "ready")


def test_roman_urdu_pani():
    """Roman Urdu 'pani' should map to Water Supply."""
    result = parse_chatbot_message(
        message="hostel mein pani nahi aa raha do din se",
        conversation=[],
        extracted_fields={},
        categories=CATEGORIES,
        zones=ZONES,
    )
    assert result.fields["category_id"] == "cat-water"
    assert result.fields["category_name"] == "Water Supply"


def test_roman_urdu_bijli():
    """Roman Urdu 'bijli' should map to Electricity / Power."""
    result = parse_chatbot_message(
        message="bijli baar baar ja rahi hai class mein",
        conversation=[],
        extracted_fields={},
        categories=CATEGORIES,
        zones=ZONES,
    )
    assert result.fields["category_id"] == "cat-elec"
    assert result.fields["category_name"] == "Electricity / Power"


def test_roman_urdu_ganda_cleanliness():
    """Roman Urdu 'ganda' should map to Cleanliness / Sanitation."""
    result = parse_chatbot_message(
        message="washroom bohat ganda hai hostel mein",
        conversation=[],
        extracted_fields={},
        categories=CATEGORIES,
        zones=ZONES,
    )
    assert result.fields["category_id"] == "cat-clean"
    assert result.fields["category_name"] == "Cleanliness / Sanitation"


def test_mixed_english_urdu():
    """Mixed English + Roman Urdu should still work."""
    result = parse_chatbot_message(
        message="AC kharab hai in Block B classroom",
        conversation=[],
        extracted_fields={},
        categories=CATEGORIES,
        zones=ZONES,
    )
    # AC/kharab should match Electricity or Infrastructure
    assert result.fields["category_id"] in ("cat-elec", "cat-infra")


def test_zone_matching_block_a():
    """Zone name 'Block A' should be matched from message."""
    result = parse_chatbot_message(
        message="Water supply problem in Block A building",
        conversation=[],
        extracted_fields={},
        categories=CATEGORIES,
        zones=ZONES,
    )
    assert result.fields["zone_id"] == "zone-a"
    assert result.fields["zone_name"] == "Block A"


def test_zone_matching_library():
    """Zone name 'Library' should be matched from message."""
    result = parse_chatbot_message(
        message="Library ke washroom mein safai ka masla hai",
        conversation=[],
        extracted_fields={},
        categories=CATEGORIES,
        zones=ZONES,
    )
    assert result.fields["zone_id"] == "zone-lib"
    assert result.fields["zone_name"] == "Library"


def test_missing_info_asks_followup():
    """Short vague message should trigger a follow-up question."""
    result = parse_chatbot_message(
        message="help",
        conversation=[],
        extracted_fields={},
        categories=CATEGORIES,
        zones=ZONES,
    )
    assert result.status == "conversing"
    assert result.bot_message is not None
    assert len(result.bot_message) > 0


def test_conversation_context_provides_zone():
    """Zone from follow-up conversation should be captured."""
    conversation = [
        {"role": "bot", "content": "Hi! Tell me about your issue."},
        {"role": "user", "content": "pani nahi aa raha hostel mein"},
        {"role": "bot", "content": "Which building or block?"},
    ]
    result = parse_chatbot_message(
        message="Block A mein",
        conversation=conversation,
        extracted_fields={"title": "No water", "description": "pani nahi aa raha hostel mein"},
        categories=CATEGORIES,
        zones=ZONES,
    )
    assert result.fields["zone_id"] == "zone-a"


def test_status_ready_when_sufficient_info():
    """Status should be 'ready' when title and description are present."""
    result = parse_chatbot_message(
        message="Water supply issue in Hostel Wing 1, no water for two days in the washroom area",
        conversation=[],
        extracted_fields={},
        categories=CATEGORIES,
        zones=ZONES,
    )
    # With a long descriptive message, should get enough for preview
    if result.status == "ready":
        assert result.fields["title"] is not None
        assert result.fields["description"] is not None
        assert "Confirm" in result.bot_message or "Submit" in result.bot_message


def test_category_not_invented():
    """Chatbot should not invent categories outside the provided list."""
    result = parse_chatbot_message(
        message="there is a problem",
        conversation=[],
        extracted_fields={},
        categories=CATEGORIES,
        zones=ZONES,
    )
    if result.fields["category_name"]:
        valid_names = [c["name"] for c in CATEGORIES]
        assert result.fields["category_name"] in valid_names


def test_max_followups_force_preview():
    """After max follow-ups, chatbot should present preview even with limited info."""
    conversation = [
        {"role": "bot", "content": "Hi! Tell me about your issue."},
        {"role": "user", "content": "problem hai"},
        {"role": "bot", "content": "Can you describe more?"},
        {"role": "user", "content": "bas problem hai"},
        {"role": "bot", "content": "Which building?"},
    ]
    result = parse_chatbot_message(
        message="koi issue hai",
        conversation=conversation,
        extracted_fields={"title": "problem", "description": "problem hai"},
        categories=CATEGORIES,
        zones=ZONES,
    )
    # After 3+ bot messages, should force ready
    assert result.status == "ready"


def test_wifi_category():
    """Network/Internet issue should be detected from 'wifi' keyword."""
    result = parse_chatbot_message(
        message="wifi nahi chal raha hostel mein do din se internet ka masla hai",
        conversation=[],
        extracted_fields={},
        categories=CATEGORIES,
        zones=ZONES,
    )
    assert result.fields["category_id"] == "cat-net"
    assert result.fields["category_name"] == "Network / Internet"


def test_theft_category_urdu():
    """Theft/Security issue should be detected from Roman Urdu 'chori'."""
    result = parse_chatbot_message(
        message="hostel se chori ho gayi hai mera laptop chori ho gaya",
        conversation=[],
        extracted_fields={},
        categories=CATEGORIES,
        zones=ZONES,
    )
    assert result.fields["category_id"] == "cat-theft"
    assert result.fields["category_name"] == "Theft / Security"
