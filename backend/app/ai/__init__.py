"""AI provider factory and package exports.

Provider selection is driven by the AI_PROVIDER config setting.
New providers can be added by implementing AIProvider and registering
them in the _PROVIDERS map below.
"""

from __future__ import annotations

from functools import lru_cache

from app.ai.base import AIProvider, AIResult  # noqa: F401 — public re-export


def _build_provider(provider_name: str) -> AIProvider:
    """Instantiate the AI provider matching *provider_name*."""
    name = (provider_name or "local").strip().lower()

    if name == "local":
        from app.ai.local_provider import LocalAIProvider
        return LocalAIProvider()

    # Fallback: treat unknown / "mock" as local rule-based
    from app.ai.local_provider import LocalAIProvider
    return LocalAIProvider()


# Module-level cached provider instance
_provider: AIProvider | None = None


def get_ai_provider(settings) -> AIProvider:
    """Return the configured AI provider (singleton)."""
    global _provider
    if _provider is None:
        _provider = _build_provider(getattr(settings, "ai_provider", "local"))
    return _provider
