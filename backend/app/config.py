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

    # AI provider (Phase 3)
    ai_provider: str = "mock"
    ai_api_key: str = ""
    ai_model: str = ""

    # Gemini API (chatbot LLM)
    gemini_api_key: str = ""

    # File uploads (local MVP storage)
    upload_dir: str = "uploads"
    max_upload_size_mb: int = 10

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8", "extra": "ignore"}


@lru_cache
def get_settings() -> Settings:
    return Settings()
