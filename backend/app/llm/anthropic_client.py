"""A hosted Claude model, with the response shape constrained by a schema.

`client.messages.parse` is used rather than `messages.create` plus a JSON parse,
so the structure is enforced by the API and `GenerationResult` comes back
validated. There is no prose-parsing path and no regex over the response: if the
model cannot fill the schema, that is an error, not something to salvage.

The SDK is an optional dependency. It is imported inside the constructor so the
package imports on a machine that has never installed it, and the registry turns
its absence into `GenerationUnavailable` with a message that names the fix.
"""

from __future__ import annotations

from typing import Any

from app.core.errors import GenerationUnavailable
from app.llm.prompt import SYSTEM_PROMPT, user_prompt
from app.llm.types import GenerationRequest, GenerationResult
from app.models.domain import Jurisdiction

_JURISDICTION_NAMES = {
    Jurisdiction.IN: "India",
    Jurisdiction.INTL: "International (outside India)",
}

_LANGUAGE_NAMES = {
    "en": "English",
    "hi": "Hindi",
    "mr": "Marathi",
    "bn": "Bengali",
    "ta": "Tamil",
    "te": "Telugu",
}


class AnthropicLLMClient:
    name = "anthropic"

    def __init__(
        self,
        *,
        api_key: str,
        model: str,
        base_url: str | None = None,
        timeout_seconds: float = 60.0,
        max_output_tokens: int = 2000,
    ) -> None:
        try:
            import anthropic
        except ImportError as error:  # pragma: no cover - exercised by the registry
            raise GenerationUnavailable(
                "The anthropic package is not installed. "
                'Install the backend with the "llm" extra, or set SAHAYAK_LLM_PROVIDER=fixture.'
            ) from error

        options: dict[str, Any] = {"api_key": api_key, "timeout": timeout_seconds}
        if base_url:
            options["base_url"] = base_url
        self._client = anthropic.Anthropic(**options)
        self._model = model
        self._max_output_tokens = max_output_tokens

    @property
    def available(self) -> bool:
        return True

    def generate(self, request: GenerationRequest) -> GenerationResult:
        response = self._client.messages.parse(
            model=self._model,
            max_tokens=self._max_output_tokens,
            system=SYSTEM_PROMPT,
            # Adaptive thinking: the work here is weighing several passages
            # against a question, which is exactly what it helps with.
            thinking={"type": "adaptive"},
            messages=[
                {
                    "role": "user",
                    "content": user_prompt(
                        question=request.question,
                        jurisdiction_name=_JURISDICTION_NAMES[request.jurisdiction],
                        product_class=request.product_class.value,
                        language_name=_LANGUAGE_NAMES.get(request.language, request.language),
                        passages=request.context.prompt_text,
                    ),
                }
            ],
            output_format=GenerationResult,
        )
        parsed = response.parsed_output
        if parsed is None:
            raise GenerationUnavailable("The model returned no structured output.")
        return parsed
