from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT_DIR = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=ROOT_DIR / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_name: str = "AI Doctor"
    debug: bool = True

    gemini_api_key: str = Field(default="", description="Google Gemini API key")
    gemini_model: str = Field(default="gemini/gemini-2.0-flash")

    openai_api_key: str = Field(default="", description="Optional OpenAI alternative")
    anthropic_api_key: str = Field(default="", description="Optional Anthropic alternative")

    cors_origins: list[str] = Field(
        default_factory=lambda: ["http://localhost:5173", "http://127.0.0.1:5173"]
    )

    firebase_service_account: Path = Field(
        default_factory=lambda: ROOT_DIR / "apps" / "api" / "firebase-service-account.json",
        description="Path to Firebase service account JSON",
    )


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
