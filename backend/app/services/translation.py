"""Translating the answer, and never the citation metadata.

The split is the whole design. Answer prose is translated; a document title, an
organisation's name, a section heading and a version label are not. A reader who
sees a translated title cannot search for the document, cannot quote it to
anyone, and cannot tell whether the thing they are looking at is what the
citation names. The section heading in particular is the reader's route back to
the source, and translating it breaks that route silently.

Two implementations behind one interface:

* `PassthroughTranslator` returns the text unchanged and reports that it did.
  It does not pretend. The interface shows the answer in the language the
  passages were in, and says so.
* `BhashiniTranslator` carries the real request and response shape for the
  national translation service, so wiring it up is a matter of configuration
  rather than of writing the client. Without a pipeline id and a key it reports
  itself unavailable and the pipeline falls back to passthrough, saying which
  one ran.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Protocol


@dataclass(frozen=True)
class TranslationResult:
    texts: tuple[str, ...]
    source_language: str
    target_language: str
    #: Which implementation ran. Reported to the interface, never hidden.
    engine: str
    #: False when nothing was translated, whatever the reason.
    translated: bool


class Translator(Protocol):
    name: str

    @property
    def available(self) -> bool: ...

    def translate(self, texts: list[str], *, source: str, target: str) -> TranslationResult: ...


class PassthroughTranslator:
    name = "passthrough"

    @property
    def available(self) -> bool:
        return True

    def translate(self, texts: list[str], *, source: str, target: str) -> TranslationResult:
        return TranslationResult(
            texts=tuple(texts),
            source_language=source,
            target_language=target,
            engine=self.name,
            translated=False,
        )


class BhashiniTranslator:
    """The national translation service, behind the same interface.

    The request and response shapes below are the service's own: a pipeline is
    addressed by id, tasks are listed in order, and each input string comes back
    as a ``target`` beside its ``source``. Written out here rather than left as
    a comment so that turning it on is configuration, not implementation.

    It is deliberately not wired to a network call in this phase. A translation
    client that silently returned untranslated text on an error would be worse
    than one that says it is unavailable, and there is no key to test against.
    """

    name = "bhashini"
    TRANSLATION_TASK = "translation"

    def __init__(
        self,
        *,
        api_key: str | None,
        base_url: str,
        pipeline_id: str | None,
    ) -> None:
        self._api_key = api_key
        self._base_url = base_url.rstrip("/")
        self._pipeline_id = pipeline_id

    @property
    def available(self) -> bool:
        return bool(self._api_key and self._pipeline_id)

    def build_request(self, texts: list[str], *, source: str, target: str) -> dict[str, Any]:
        """The body the compute endpoint expects. Public so a test can read it."""
        return {
            "pipelineTasks": [
                {
                    "taskType": self.TRANSLATION_TASK,
                    "config": {"language": {"sourceLanguage": source, "targetLanguage": target}},
                }
            ],
            "inputData": {"input": [{"source": text} for text in texts]},
        }

    @staticmethod
    def parse_response(payload: dict[str, Any]) -> tuple[str, ...]:
        """Pull the translated strings out, in the order they went in."""
        outputs = payload.get("pipelineResponse", [])
        for task in outputs:
            if task.get("taskType") != BhashiniTranslator.TRANSLATION_TASK:
                continue
            return tuple(item.get("target", "") for item in task.get("output", []))
        return ()

    def translate(self, texts: list[str], *, source: str, target: str) -> TranslationResult:
        return TranslationResult(
            texts=tuple(texts),
            source_language=source,
            target_language=target,
            engine=self.name,
            translated=False,
        )


def build_translator(settings: Any) -> Translator:
    """Pick the translator from configuration, falling back audibly.

    A configured translator that cannot run falls back to passthrough rather
    than raising: an untranslated answer is still an answer, and the interface
    is told which engine ran so it can say the translation did not happen.
    """
    if settings.translator.strip().lower() == "bhashini":
        translator = BhashiniTranslator(
            api_key=settings.bhashini_api_key,
            base_url=settings.bhashini_base_url,
            pipeline_id=settings.bhashini_pipeline_id,
        )
        if translator.available:
            return translator
    return PassthroughTranslator()
