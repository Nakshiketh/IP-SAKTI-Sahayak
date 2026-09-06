"""Runtime settings, read from the environment or a local .env file.

Nothing secret is committed. `.env.example` lists the keys; `.env` is gitignored.
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

REPO_ROOT = Path(__file__).resolve().parents[3]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(REPO_ROOT / "backend" / ".env"),
        env_prefix="SAHAYAK_",
        extra="ignore",
    )

    app_name: str = "IP-SAKTI Sahayak"
    environment: str = "development"
    debug: bool = True

    host: str = "127.0.0.1"
    port: int = 8000

    #: Comma-separated origins allowed to call the API in development.
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"

    #: Version label for the source set an answer relied on. Set by the corpus
    #: pipeline in Phase 11; carried on every answer so "as of" is never guessed.
    corpus_version: str = "0.0.0-unbuilt"

    data_dir: Path = Field(default=REPO_ROOT / "data")
    corpus_dir: Path = Field(default=REPO_ROOT / "corpus")

    #: Set in Phase 10. Absent here on purpose — nothing calls a model yet.
    llm_api_key: str | None = None
    bhashini_api_key: str | None = None

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
