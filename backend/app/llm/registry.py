"""Picking the generator from configuration.

One function, so there is exactly one place that decides what may write an
answer. A misconfiguration surfaces here as `GenerationUnavailable` with a
message naming the setting to fix, rather than as a quiet fall back to the
fixture — falling back would mean a deployment that thought it had a model
serving demo answers over real passages, which is the one outcome this module
exists to prevent.
"""

from __future__ import annotations

from app.core.errors import GenerationUnavailable
from app.core.settings import Settings
from app.llm.fixture import FixtureLLMClient
from app.llm.types import LLMClient


def build_llm_client(settings: Settings) -> LLMClient:
    provider = settings.llm_provider.strip().lower()

    if provider == "fixture":
        return FixtureLLMClient(settings.fixtures_dir)

    if provider == "anthropic":
        if not settings.llm_api_key:
            raise GenerationUnavailable(
                "SAHAYAK_LLM_PROVIDER is anthropic but SAHAYAK_LLM_API_KEY is not set."
            )
        from app.llm.anthropic_client import AnthropicLLMClient

        return AnthropicLLMClient(
            api_key=settings.llm_api_key,
            model=settings.llm_model,
            base_url=settings.llm_base_url,
            timeout_seconds=settings.llm_timeout_seconds,
            max_output_tokens=settings.llm_max_output_tokens,
        )

    raise GenerationUnavailable(
        "Unknown SAHAYAK_LLM_PROVIDER: " + settings.llm_provider + ". Use fixture or anthropic."
    )
