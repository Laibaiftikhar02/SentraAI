"""Pydantic schemas for the AI Reporting Chatbot."""

from __future__ import annotations

from pydantic import BaseModel, Field


class ConversationMessage(BaseModel):
    """A single message in the conversation history."""
    role: str = Field(..., pattern="^(user|bot)$")
    content: str


class ChatbotParseRequest(BaseModel):
    """Request body for the chatbot parse endpoint."""
    message: str = Field(min_length=1, max_length=2000)
    conversation: list[ConversationMessage] = []
    extracted_fields: dict = {}


class ExtractedFields(BaseModel):
    """Fields extracted from the conversation so far."""
    title: str | None = None
    description: str | None = None
    category_id: str | None = None
    category_name: str | None = None
    zone_id: str | None = None
    zone_name: str | None = None


class ChatbotParseResponse(BaseModel):
    """Response from the chatbot parse endpoint."""
    bot_message: str
    fields: ExtractedFields
    status: str = Field(..., description="conversing | ready")
    suggestions: list[str] = []
