"""Common response envelope for all API endpoints (proposal, not locked)."""

from typing import Any, Optional
from pydantic import BaseModel


class SuccessResponse(BaseModel):
    data: Any
    meta: Optional[dict] = None


class ErrorDetail(BaseModel):
    code: str
    message: str
    details: Optional[Any] = None


class ErrorResponse(BaseModel):
    error: ErrorDetail
