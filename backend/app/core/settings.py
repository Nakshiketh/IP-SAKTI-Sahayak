"""Runtime settings, read from the environment or a local .env file.

Nothing secret is committed. `.env.example` lists the keys; `.env` is gitignored.

Phase 10 adds the pipeline's settings. Two of them decide how much of the system
is real on any given machine:

* ``llm_provider`` picks the generator. ``fixture`` is the offline default and
  refuses to write over anything but demo passages, so an unconfigured install
  can demo but can never dress a fixture answer up as retrieval from a real
  document.
* ``translator`` picks the translation implementation. ``passthrough`` returns
  the text unchanged and says so, rather than pretending to translate.
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

    #: The verified guidance corpus: passages restating official sources, each
    #: with the URL it was checked against. Served for any jurisdiction whose
    #: built index is absent. Point at a missing file to fall back to the demo
    #: fixture.
    knowledge_base_override: Path | None = None

    #: Where the built index is read from. Overridable so an ingest can be
    #: served without being moved on top of the one in place — pointing this at
    #: `data/index-samples` is how the sample build is demonstrated.
    index_dir_override: Path | None = None

    #: Where the source registry is read from. Overridable so a test or a
    #: rebuilt registry can be served without moving it on top of the one in
    #: place.
    registry_db_override: Path | None = None

    #: Where the records database is read from. Overridable for the same reason
    #: as the index: so a build made elsewhere can be served without being moved
    #: on top of the one in place.
    records_db_override: Path | None = None

    #: Which records manifest the service reads. Overridden together with the
    #: database, so a sample build is served against the manifest it came from
    #: rather than against the real source list.
    records_manifest_override: Path | None = None

    # -- retrieval ---------------------------------------------------------

    #: Candidates each channel contributes before fusion.
    retrieval_candidates: int = 30
    #: Passages that survive reranking and are packed into the context.
    rerank_keep: int = 8
    #: Reciprocal rank fusion constant. 60 is the value the method was published
    #: with; named here so a change to it is a decision rather than a tweak.
    fusion_k: int = 60
    #: Token budget for the packed passages, and the most any one document may
    #: take of it. The second number is what stops one long act filling the
    #: window and turning a four-source answer into a one-source answer.
    context_token_budget: int = 6000
    context_max_share_per_document: float = 0.5

    # -- generation --------------------------------------------------------

    #: "fixture" | "anthropic". See `app.llm.registry`.
    llm_provider: str = "fixture"
    llm_model: str = "claude-sonnet-5"
    llm_api_key: str | None = None
    llm_base_url: str = "https://api.anthropic.com"
    llm_timeout_seconds: float = 60.0
    llm_max_output_tokens: int = 2000
    #: Recorded on every audit row, so an answer can be traced to the exact
    #: instruction that produced it.
    prompt_version: str = "2026-09-08.1"
    #: "auto" | "rules" | "model". Who reads an inventor's messages in the invention
    #: analyst. "auto" uses the hosted model when one is configured above, and the
    #: built-in rules otherwise. See `app.analyst.model_reader`.
    analyst_reader: str = "auto"

    # -- translation -------------------------------------------------------

    #: "passthrough" | "bhashini". See `app.services.translation`.
    translator: str = "passthrough"
    bhashini_api_key: str | None = None
    bhashini_base_url: str = "https://dhruva-api.bhashini.gov.in"
    bhashini_pipeline_id: str | None = None

    # -- limits ------------------------------------------------------------

    #: Requests a session may make per window, and the window in seconds.
    rate_limit_requests: int = 30
    rate_limit_window_seconds: int = 60
    #: Largest request body the API will read, in bytes.
    max_request_bytes: int = 32_768
    #: The ceiling for the upload routes only. A question is a sentence;
    #: a document is megabytes, and one limit cannot serve both.
    max_upload_bytes: int = 10 * 1024 * 1024
    #: Longest question accepted, in characters.
    max_question_chars: int = 2_000

    # -- audit -------------------------------------------------------------

    audit_enabled: bool = True

    # -- feature flags -----------------------------------------------------
    # Declared in Phase 0 of the upgrade so later phases can hide work behind a
    # flag rather than deleting reusable code. The frontend half is
    # `frontend/src/config/features.ts`; keep the two in step.
    #
    # `feature_scan_badge_login` is on, which departs from the phase pack's
    # suggested default: badge scanning is the sign-in in use and the login
    # page is not to be disturbed. See docs/upgrade/PROGRESS.md.
    #
    # `feature_jury_demo` and `feature_voice` are on because the work behind
    # them is finished and tested, and a finished feature left switched off is
    # indistinguishable from one that was never built. The three still false
    # have no interface yet: turning them on would show nothing.

    feature_jury_demo: bool = True
    feature_voice: bool = True
    feature_helpline_sim: bool = True
    feature_document_intel: bool = True
    feature_admin_insights: bool = True
    feature_scan_badge_login: bool = True
    feature_public_ask: bool = False

    # -- administration ----------------------------------------------------
    #: Usernames allowed to read /api/v1/admin/insight, comma-separated.
    #:
    #: Named here rather than as a role on the accounts table. A role column is
    #: a migration on the table every sign-in depends on, for a list that in
    #: practice holds one or two names and changes when a deployment changes.
    #: Empty means nobody, which is the right default: an administrator is
    #: something a deployment grants, never something that exists by accident.
    admin_usernames: str = ""

    # -- member authentication ---------------------------------------------
    #: Read by the exact names in `docs/auth/AUTH_PLAN.md`, without the
    #: `SAHAYAK_` prefix: they are the names a deployment is told to fill, and a
    #: prefix nobody asked for is a key somebody fills under the wrong name.
    #: None of them is ever logged or returned.

    email_host: str = Field(default="smtp.gmail.com", validation_alias="EMAIL_HOST")
    email_port: int = Field(default=465, validation_alias="EMAIL_PORT")
    email_secure: bool = Field(default=True, validation_alias="EMAIL_SECURE")
    email_user: str = Field(default="", validation_alias="EMAIL_USER")
    email_password: str = Field(default="", validation_alias="EMAIL_PASSWORD")
    email_from: str = Field(default="", validation_alias="EMAIL_FROM")

    session_secret: str = Field(default="", validation_alias="SESSION_SECRET")
    otp_secret: str = Field(default="", validation_alias="OTP_SECRET")

    app_base_url: str = Field(default="", validation_alias="APP_BASE_URL")
    cookie_secure: bool = Field(default=False, validation_alias="COOKIE_SECURE")

    #: The demo member's temporary password. The seed refuses to run without it.
    demo_member_temp_password: str = Field(default="", validation_alias="DEMO_MEMBER_TEMP_PASSWORD")
    enable_demo_card: bool = Field(default=False, validation_alias="ENABLE_DEMO_CARD")

    @property
    def members_db_path(self) -> Path:
        """Members live beside the old accounts table: one accounts database."""
        return self.data_dir / "accounts.sqlite3"

    @property
    def admin_username_list(self) -> list[str]:
        return [name.strip() for name in self.admin_usernames.split(",") if name.strip()]

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    @property
    def index_dir(self) -> Path:
        """Where the corpus pipeline writes the built index."""
        return self.index_dir_override or (self.data_dir / "index")

    @property
    def registry_db_path(self) -> Path:
        """The source registry. Built by scripts/registry_backfill.py."""
        return self.registry_db_override or (self.data_dir / "registry.sqlite3")

    @property
    def knowledge_base_path(self) -> Path:
        return self.knowledge_base_override or (
            self.corpus_dir / "guidance" / "knowledge-base.json"
        )

    @property
    def fixtures_dir(self) -> Path:
        return self.data_dir / "fixtures"

    @property
    def audit_db_path(self) -> Path:
        return self.data_dir / "audit.sqlite3"

    @property
    def feedback_db_path(self) -> Path:
        """Kept in its own file, not beside the audit log.

        Two stores in one file invites a join that must never be possible.
        """
        return self.data_dir / "feedback.sqlite3"

    @property
    def records_db_path(self) -> Path:
        """Layer 2, in its own file. Never under `index/`, which is Layer 1."""
        return self.records_db_override or (self.data_dir / "records.sqlite3")

    @property
    def records_manifest_path(self) -> Path:
        return self.records_manifest_override or (self.corpus_dir / "records-manifest.json")


@lru_cache
def get_settings() -> Settings:
    return Settings()
