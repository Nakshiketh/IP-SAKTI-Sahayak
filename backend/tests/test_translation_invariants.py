"""Translation is the one place verified text is rewritten. This holds it.

Everything upstream is held to "only what a source says". A translator that
drops a section number, changes a year, or renders an acronym phonetically
breaks that after the checking is done — and breaks it invisibly, because the
reader who needs the translation is least able to notice.

The rule these tests encode: if the translation cannot be verified, the English
is shown with a note. Never a half-translated answer, and never a translated
answer citing the wrong provision.
"""

from __future__ import annotations

import pytest

from app.core.settings import REPO_ROOT, Settings
from app.llm.composer import GroundedComposerClient
from app.retrieval.store import Namespaces
from app.services import invariants
from app.services.audit import AuditLog
from app.services.pipeline import Pipeline, QueryRequest, ResultEvent
from app.services.translation import TranslationResult

KNOWLEDGE = REPO_ROOT / "corpus" / "guidance" / "knowledge-base.json"


class FakeTranslator:
    """A translator that does exactly what it is told to, including badly."""

    name = "fake"

    def __init__(self, transform) -> None:
        self._transform = transform

    @property
    def available(self) -> bool:
        return True

    def translate(self, texts: list[str], *, source: str, target: str) -> TranslationResult:
        return TranslationResult(
            texts=tuple(self._transform(text) for text in texts),
            source_language=source,
            target_language=target,
            engine=self.name,
            translated=True,
        )


def pipeline_with(translator, tmp_path) -> Pipeline:
    settings = Settings(knowledge_base_override=KNOWLEDGE, audit_enabled=False)
    return Pipeline(
        settings=settings,
        namespaces=Namespaces(tmp_path / "no-index", settings.fixtures_dir, KNOWLEDGE),
        llm=GroundedComposerClient(KNOWLEDGE, settings.fixtures_dir),
        translator=translator,
        audit=AuditLog(tmp_path / "audit.sqlite3", enabled=False),
    )


def ask(pipeline: Pipeline, question: str, language_out: str = "hi"):
    request = QueryRequest(question=question, language_in="en", language_out=language_out)
    for event in pipeline.run(request):
        if isinstance(event, ResultEvent):
            return event.outcome
    raise AssertionError("the pipeline produced no result")


QUESTION = "How do I request examination of a patent application?"


# -- the check itself ---------------------------------------------------------


def test_a_faithful_translation_passes() -> None:
    result = invariants.check(
        "File Form 18 under Rule 24B within 31 months.",
        "Rule 24B ke tahat 31 mahine ke bhitar Form 18 dakhil karein.",
    )
    assert result.ok


def test_a_dropped_section_number_fails() -> None:
    result = invariants.check("Section 3(p) of the Patents Act, 1970.", "Patents Act ki dhara.")
    assert result.ok is False
    assert "3(p)" in result.missing_numbers
    assert result.reason_key == "translationUnverified"


def test_a_changed_year_fails() -> None:
    # 1970 becoming 1971 is not a translation; it is a different Act.
    assert invariants.check("the Patents Act, 1970", "the Patents Act, 1971").ok is False


def test_a_lost_acronym_fails() -> None:
    result = invariants.check(
        "Apply to the NBA before filing.", "Aavedan karein pehle daakhil karne se."
    )
    assert result.ok is False
    assert "NBA" in result.missing_acronyms


def test_an_acronym_kept_in_latin_script_passes() -> None:
    assert invariants.check("Apply to the NBA.", "NBA ko aavedan karein.").ok


def test_reordering_is_not_a_failure() -> None:
    # A language that puts the number after the name has translated correctly.
    assert invariants.check("Section 3(p) applies.", "Dhara 3(p) laagu hoti hai.").ok


def test_losing_one_of_two_mentions_is_a_failure() -> None:
    result = invariants.check("1970 and 1970 again", "1970 once")
    assert result.ok is False


def test_one_bad_block_fails_the_whole_answer() -> None:
    # Half an answer translated leaves the reader to work out which half to
    # trust, which is not a judgement they are in a position to make.
    result = invariants.check_all(
        ["Section 3(p) applies.", "File Form 18."],
        ["Dhara 3(p) laagu hoti hai.", "Form dakhil karein."],
    )
    assert result.ok is False
    assert "18" in result.missing_numbers


# -- what the pipeline does about it ------------------------------------------


def test_a_verified_translation_is_used(tmp_path) -> None:
    # Appending a marker keeps every number and acronym, so it must be accepted.
    outcome = ask(pipeline_with(FakeTranslator(lambda text: text + " [hi]"), tmp_path), QUESTION)
    assert outcome.answer is not None
    assert outcome.translated is True
    assert any("[hi]" in block.text for block in outcome.answer.blocks)


def test_a_translation_that_loses_a_number_falls_back_to_english(tmp_path) -> None:
    import re

    stripped = FakeTranslator(lambda text: re.sub(r"\d+", "", text))
    outcome = ask(pipeline_with(stripped, tmp_path), QUESTION)
    assert outcome.answer is not None
    assert outcome.translated is False, "the reader is shown English, not a broken translation"


def test_a_translation_that_adds_a_promise_is_refused(tmp_path) -> None:
    # The blocked-phrase filter runs on the translation too: a guarantee the
    # English never made can appear in a translation of it.
    promising = FakeTranslator(lambda text: text + " Your patent is guaranteed.")
    outcome = ask(pipeline_with(promising, tmp_path), QUESTION)
    assert outcome.answer is not None
    assert outcome.translated is False
    for block in outcome.answer.blocks:
        assert "guaranteed" not in block.text


def test_citation_metadata_is_never_translated(tmp_path) -> None:
    outcome = ask(pipeline_with(FakeTranslator(lambda text: text + " [hi]"), tmp_path), QUESTION)
    assert outcome.answer is not None
    for citation in outcome.answer.citations:
        assert "[hi]" not in citation.document_title
        assert "[hi]" not in citation.organization


@pytest.mark.parametrize("language", ["hi", "te", "ta"])
def test_language_never_changes_the_safety_outcome(language: str, tmp_path) -> None:
    # The abstention code and escalation level must not depend on the language
    # the reader asked in.
    english = ask(pipeline_with(FakeTranslator(lambda t: t), tmp_path), QUESTION, "en")
    other = ask(pipeline_with(FakeTranslator(lambda t: t + " ."), tmp_path), QUESTION, language)
    assert english.analysis.abstain_code == other.analysis.abstain_code
    assert english.analysis.escalation.level is other.analysis.escalation.level
