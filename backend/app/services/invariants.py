"""What a translation is not allowed to lose.

Translating an answer is the one place in this pipeline where verified text is
rewritten by something other than the composer. Everything upstream has been
held to "only what a source says"; a translator that drops a section number,
rounds a year, or renders an acronym phonetically breaks that guarantee after
all the checking is done — and it breaks it invisibly, because the reader who
needs the translation is the reader least able to notice.

So the translated text is checked against the English it came from. Not for
meaning, which no mechanical check can do, but for the tokens that must survive
any honest translation of a legal sentence:

* numbers, including years and section numbers — "Section 3(p)" is not the same
  provision as "Section 3", and 1970 is not 1971;
* acronyms the glossary and the corpus rely on — PCT, TKDL, NBA, ABS, WIPO,
  FSSAI, AYUSH — which name institutions and instruments, not concepts;
* the identifiers a citation is traced by.

A failed check is not a silent correction. The English is shown instead, with a
note saying the translation could not be verified. A reader who wanted Hindi and
got English with an explanation has been told the truth; a reader who got a
Hindi answer citing the wrong section has not.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

#: Institutions and instruments whose names do not translate. A translation that
#: renders "PCT" phonetically has produced a word the reader cannot search for.
PROTECTED_ACRONYMS = (
    "PCT",
    "TKDL",
    "NBA",
    "ABS",
    "WIPO",
    "FSSAI",
    "AYUSH",
    "GI",
    "IPC",
    "NBAP",
    "CGPDTM",
    "CDSCO",
)

#: Any run of digits, with whatever a legal citation hangs off it: "3(p)",
#: "158-B", "1970", "10(4)(d)(ii)(D)".
_NUMBER = re.compile(r"\d+(?:[.\-/]\d+)*(?:\s*\([0-9a-zA-Z]+\))*")


@dataclass(frozen=True)
class InvariantResult:
    ok: bool
    #: What the English had and the translation does not. Reported, not guessed at.
    missing_numbers: tuple[str, ...] = ()
    missing_acronyms: tuple[str, ...] = ()

    @property
    def reason_key(self) -> str | None:
        if self.ok:
            return None
        return "translationUnverified"


def _numbers(text: str) -> list[str]:
    return [match.group(0).replace(" ", "") for match in _NUMBER.finditer(text)]


def _acronyms(text: str) -> list[str]:
    return [word for word in PROTECTED_ACRONYMS if re.search(rf"\b{word}\b", text)]


def check(source: str, translated: str) -> InvariantResult:
    """Did everything that must survive the translation survive it?

    Counts matter, not order: a language that puts the section number after the
    provision name has translated correctly, and a translation that mentions
    1970 once where the English mentioned it twice has lost one of them.
    """
    source_numbers = _numbers(source)
    translated_numbers = _numbers(translated)
    missing_numbers = []
    remaining = list(translated_numbers)
    for number in source_numbers:
        if number in remaining:
            remaining.remove(number)
        else:
            missing_numbers.append(number)

    missing_acronyms = [
        acronym for acronym in _acronyms(source) if not re.search(rf"\b{acronym}\b", translated)
    ]

    return InvariantResult(
        ok=not missing_numbers and not missing_acronyms,
        missing_numbers=tuple(dict.fromkeys(missing_numbers)),
        missing_acronyms=tuple(missing_acronyms),
    )


def check_all(sources: list[str], translations: list[str]) -> InvariantResult:
    """One verdict over a whole answer. Any block failing fails the answer.

    Showing half an answer translated and half in English would leave the reader
    to work out which half they can trust.
    """
    numbers: list[str] = []
    acronyms: list[str] = []
    for source, translated in zip(sources, translations, strict=False):
        result = check(source, translated)
        numbers.extend(result.missing_numbers)
        acronyms.extend(result.missing_acronyms)
    return InvariantResult(
        ok=not numbers and not acronyms,
        missing_numbers=tuple(dict.fromkeys(numbers)),
        missing_acronyms=tuple(dict.fromkeys(acronyms)),
    )
