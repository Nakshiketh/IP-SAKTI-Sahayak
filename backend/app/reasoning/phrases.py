"""The last check before an answer is shown: does it promise anything?

The composer only rearranges retrieved passages, so in the ordinary case it
cannot produce a promise that no source made. This runs anyway, for two reasons.
A source can itself contain a sentence that reads as a guarantee once it is
lifted out of context, and a hosted model may one day be put behind the same
interface. A filter that only works when nothing has gone wrong is not a filter.

Two outcomes, not one. A phrase with a defensible neutral form is rewritten —
"will be granted" becomes "is examined for". A phrase with no neutral form, an
outright assurance of a legal outcome, blocks the claim: it is dropped from the
answer and counted, exactly as an unsupported citation is.

The blocked list is deliberately short. Every entry is a promise about what an
authority will decide, which is the one thing no source in this corpus says and
no reader should be led to believe.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

#: pattern -> the neutral form. Each keeps the sentence true and removes the
#: promise; where none exists, the phrase belongs in BLOCK instead.
REWRITE: tuple[tuple[re.Pattern[str], str], ...] = (
    (re.compile(r"\bwill (?:be )?grant(?:ed)?\b", re.IGNORECASE), "is examined for grant"),
    (re.compile(r"\bwill (?:be )?approv(?:e|ed)\b", re.IGNORECASE), "is considered for approval"),
    (re.compile(r"\byou will receive\b", re.IGNORECASE), "the procedure provides for"),
    (re.compile(r"\bis definitely\b", re.IGNORECASE), "is"),
    (re.compile(r"\bis certainly\b", re.IGNORECASE), "is"),
    (re.compile(r"\bwe recommend\b", re.IGNORECASE), "the official guidance sets out"),
)

#: No neutral form exists for these; a claim containing one is dropped.
BLOCK: tuple[re.Pattern[str], ...] = (
    re.compile(r"\bguarantee(?:d|s)?\b", re.IGNORECASE),
    re.compile(r"\b(?:is|are) (?:100%|fully) (?:safe|legal|protected)\b", re.IGNORECASE),
    re.compile(r"\bno(?:t)? (?:any )?risk\b", re.IGNORECASE),
    re.compile(r"\byour (?:patent|application) (?:is|will be) (?:novel|valid)\b", re.IGNORECASE),
    re.compile(r"\bcannot be (?:rejected|refused|challenged)\b", re.IGNORECASE),
)


@dataclass(frozen=True)
class Filtered:
    text: str
    #: True when the whole claim must be dropped rather than shown rewritten.
    blocked: bool
    #: The phrases that fired, for the audit row.
    matched: tuple[str, ...] = ()


def filter_text(text: str) -> Filtered:
    for pattern in BLOCK:
        found = pattern.search(text)
        if found:
            return Filtered(text=text, blocked=True, matched=(found.group(0),))

    matched: list[str] = []
    rewritten = text
    for pattern, replacement in REWRITE:
        found = pattern.search(rewritten)
        if found:
            matched.append(found.group(0))
            rewritten = pattern.sub(replacement, rewritten)
    return Filtered(text=rewritten, blocked=False, matched=tuple(matched))
