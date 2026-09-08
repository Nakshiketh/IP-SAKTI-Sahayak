"""Which language a question is written in, decided by its script.

This is the server-side half of `frontend/src/lib/detectScript.ts` and reports
the same thing in the same shape. It is duplicated rather than shared because
the two run at different moments and answer slightly different questions: the
frontend runs on every keystroke to offer a correction while the reader is still
typing, and this runs once on the submitted text to decide which language the
answer is written in.

Script detection, not language identification, and the difference matters.
Counting characters in Unicode blocks tells you reliably that text is Telugu or
Tamil or Bengali. It cannot tell Hindi from Marathi, because both are written in
Devanagari — so where the script is shared this reports the ambiguity rather than
guessing, and the confidence it returns goes back to the interface so a reader
can correct it.
"""

from __future__ import annotations

import unicodedata
from dataclasses import dataclass

DEFAULT_LANGUAGE = "en"

#: Minimum letters before a guess is worth making at all.
MIN_LETTERS = 3


@dataclass(frozen=True)
class ScriptRange:
    language: str
    #: Languages sharing this script that cannot be told apart by it.
    shared_with: tuple[str, ...]
    start: int
    end: int


SCRIPTS: tuple[ScriptRange, ...] = (
    # Devanagari carries both Hindi and Marathi. The block cannot separate them.
    ScriptRange("hi", ("mr",), 0x0900, 0x097F),
    ScriptRange("bn", (), 0x0980, 0x09FF),
    ScriptRange("ta", (), 0x0B80, 0x0BFF),
    ScriptRange("te", (), 0x0C00, 0x0C7F),
)


@dataclass(frozen=True)
class Detection:
    language: str
    #: Share of letters that fell in the winning script, 0 to 1.
    confidence: float
    #: Non-empty means the script identified the writing system but not the
    #: language, and the interface says so.
    ambiguous_with: tuple[str, ...]
    #: False when there was not enough text to say anything.
    decided: bool


UNDECIDED = Detection(DEFAULT_LANGUAGE, 0.0, (), False)


def _is_latin(character: str) -> bool:
    try:
        return "LATIN" in unicodedata.name(character)
    except ValueError:
        return False


def detect_language(text: str) -> Detection:
    stripped = text.strip()
    if not stripped:
        return UNDECIDED

    counts: dict[str, int] = {}
    latin = 0
    letters = 0

    for character in stripped:
        code = ord(character)
        script = next((r for r in SCRIPTS if r.start <= code <= r.end), None)
        if script is not None:
            counts[script.language] = counts.get(script.language, 0) + 1
            letters += 1
            continue
        if character.isalpha() and _is_latin(character):
            latin += 1
            letters += 1

    if letters < MIN_LETTERS:
        return UNDECIDED

    winner = DEFAULT_LANGUAGE
    best = latin
    for language, count in counts.items():
        if count > best:
            winner = language
            best = count

    shared = next((r.shared_with for r in SCRIPTS if r.language == winner), ())
    return Detection(
        language=winner,
        confidence=round(best / letters, 4),
        ambiguous_with=shared,
        decided=True,
    )
