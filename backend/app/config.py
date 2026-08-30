from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    # Database
    database_url: str = "postgresql://postgres:postgres@localhost:5432/sentraai_dev"

    # JWT
    jwt_secret_key: str = "CHANGE_ME_TO_A_RANDOM_STRING"
    jwt_algorithm: str = "HS256"
    jwt_access_token_expire_minutes: int = 60

    # Server
    backend_port: int = 8000
    frontend_url: str = "http://localhost:3000"

    # AI provider — complaint-triage engine
    # "gemini" → Gemini LLM triage with automatic local fallback (primary)
    # "local" / "mock" → rule-based provider only
    ai_provider: str = "gemini"
    ai_api_key: str = ""  # legacy — prefer GEMINI_API_KEY below
    ai_model: str = "gemini-3.6-flash"
    ai_timeout_seconds: float = 20
    ai_max_retries: int = 1

    # Gemini API key — single credential shared by the reporting chatbot
    # and the complaint-triage provider. Backend-only secret.
    gemini_api_key: str = ""

    # File uploads (local MVP storage)
    upload_dir: str = "uploads"
    max_upload_size_mb: int = 10

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8", "extra": "ignore"}


@lru_cache
def get_settings() -> Settings:
    return Settings()
