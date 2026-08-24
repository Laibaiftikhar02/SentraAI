"""Local file storage utility for complaint attachments (hackathon MVP).

Stores uploaded files in a configurable local directory with UUID-based safe
filenames.  Validates file type and size before persisting.
"""

from __future__ import annotations

import os
import uuid
from pathlib import Path

from fastapi import UploadFile, HTTPException, status

from app.config import get_settings

settings = get_settings()

# ── Allowed MIME types ────────────────────────────────────────────────────────
# Images + common document types.  Executables are explicitly excluded.
ALLOWED_CONTENT_TYPES: set[str] = {
    # Images
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
    # Documents
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "text/plain",
}

# Extension → MIME mapping for double-check
ALLOWED_EXTENSIONS: set[str] = {
    ".jpg", ".jpeg", ".png", ".gif", ".webp",
    ".pdf", ".doc", ".docx", ".txt",
}

MAX_SIZE_BYTES: int = settings.max_upload_size_mb * 1024 * 1024


def _get_upload_dir() -> Path:
    """Return the upload directory, creating it if needed."""
    upload_dir = Path(settings.upload_dir)
    if not upload_dir.is_absolute():
        # Relative to backend root
        backend_root = Path(__file__).resolve().parent.parent.parent
        upload_dir = backend_root / upload_dir
    upload_dir.mkdir(parents=True, exist_ok=True)
    return upload_dir


def validate_upload(file: UploadFile) -> None:
    """Raise HTTP 422 if the file fails type or size validation."""
    # Check content type
    content_type = (file.content_type or "").lower().split(";")[0].strip()
    if content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"File type '{content_type}' is not supported. "
                   f"Allowed: images (JPEG, PNG, GIF, WebP), PDF, DOC/DOCX, TXT.",
        )

    # Check extension
    ext = Path(file.filename or "").suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"File extension '{ext}' is not allowed.",
        )

    # Check size — read content length from headers or stream
    size = file.size
    if size is not None and size > MAX_SIZE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"File too large. Maximum size is {settings.max_upload_size_mb} MB.",
        )


async def save_upload(file: UploadFile) -> tuple[str, str, int]:
    """Save an uploaded file to local storage.

    Returns:
        (stored_filename, original_filename, file_size_bytes)
    """
    validate_upload(file)

    upload_dir = _get_upload_dir()
    ext = Path(file.filename or "").suffix.lower()
    stored_filename = f"{uuid.uuid4().hex}{ext}"
    dest = upload_dir / stored_filename

    content = await file.read()
    file_size = len(content)

    if file_size > MAX_SIZE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"File too large. Maximum size is {settings.max_upload_size_mb} MB.",
        )

    with open(dest, "wb") as f:
        f.write(content)

    return stored_filename, file.filename or stored_filename, file_size


def get_file_path(stored_filename: str) -> Path:
    """Return the absolute path to a stored file."""
    return _get_upload_dir() / stored_filename


def delete_file(stored_filename: str) -> None:
    """Delete a stored file (best-effort, no error if missing)."""
    path = get_file_path(stored_filename)
    if path.exists():
        os.remove(path)
