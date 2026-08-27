"""Chatbot API endpoint — AI-powered student issue reporting.

Uses the Gemini LLM (free tier) when available, with automatic fallback
to the existing keyword-based chatbot service.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.middleware.auth import CurrentUser, get_current_user
from app.models.campus_zone import CampusZone
from app.models.category import Category
from app.schemas.chatbot import (
    ChatbotParseRequest,
    ChatbotParseResponse,
    ExtractedFields,
)
from app.services.chatbot_service import parse_chatbot_message
from app.services.gemini_service import process_with_gemini

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/chatbot", tags=["chatbot"])


@router.post("/parse", response_model=ChatbotParseResponse)
async def chatbot_parse(
    body: ChatbotParseRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Parse a chatbot message and extract structured issue fields.

    Tries the Gemini LLM first (intelligent, multilingual, function-calling).
    Falls back to the keyword-based chatbot if Gemini is unavailable.
    """
    # Load org-scoped categories and zones (read-only)
    categories = [
        {"id": str(c.id), "name": c.name, "description": c.description}
        for c in (
            db.query(Category)
            .filter(
                Category.organization_id == current_user.organization_id,
                Category.is_active.is_(True),
            )
            .order_by(Category.name)
            .all()
        )
    ]

    zones = [
        {"id": str(z.id), "name": z.name, "zone_type": z.zone_type}
        for z in (
            db.query(CampusZone)
            .filter(
                CampusZone.organization_id == current_user.organization_id,
                CampusZone.is_active.is_(True),
            )
            .order_by(CampusZone.name)
            .all()
        )
    ]

    # Convert conversation messages to dicts
    conversation_dicts = [
        {"role": msg.role, "content": msg.content}
        for msg in body.conversation
    ]

    # ── Try Gemini LLM first ─────────────────────────────────────────
    gemini_result = await process_with_gemini(
        message=body.message,
        conversation=conversation_dicts,
        extracted_fields=body.extracted_fields,
        categories=categories,
        zones=zones,
    )

    if gemini_result is not None:
        return ChatbotParseResponse(
            bot_message=gemini_result["bot_message"],
            fields=ExtractedFields(
                title=gemini_result["fields"].get("title"),
                description=gemini_result["fields"].get("description"),
                category_id=gemini_result["fields"].get("category_id"),
                category_name=gemini_result["fields"].get("category_name"),
                zone_id=gemini_result["fields"].get("zone_id"),
                zone_name=gemini_result["fields"].get("zone_name"),
            ),
            status=gemini_result["status"],
            suggestions=gemini_result.get("suggestions", []),
        )

    # ── Fallback: keyword-based chatbot ──────────────────────────────
    logger.info("Gemini unavailable; using keyword-based chatbot fallback")
    result = parse_chatbot_message(
        message=body.message,
        conversation=conversation_dicts,
        extracted_fields=body.extracted_fields,
        categories=categories,
        zones=zones,
    )

    return ChatbotParseResponse(
        bot_message=result.bot_message,
        fields=ExtractedFields(
            title=result.fields.get("title"),
            description=result.fields.get("description"),
            category_id=result.fields.get("category_id"),
            category_name=result.fields.get("category_name"),
            zone_id=result.fields.get("zone_id"),
            zone_name=result.fields.get("zone_name"),
        ),
        status=result.status,
        suggestions=result.suggestions,
    )
