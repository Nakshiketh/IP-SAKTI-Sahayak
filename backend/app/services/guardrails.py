"""What the product refuses to do, and how it treats what it retrieves.

Two separate jobs live here because they are the same idea pointed in opposite
directions. `classify_refusal` looks at what the reader asked and declines the
questions this product must not answer. `neutralise` looks at what the corpus
returned and strips its power to instruct — retrieved text is evidence to be
cited, never a command to follow.

The refusals are matched on the question, before retrieval runs. That ordering
is deliberate: a dosage question must be refused whether or not the corpus
happens to contain a passage that looks like an answer, and running retrieval
first would make the refusal contingent on what was found.

Every pattern here is a word-boundary match on the question, not a model call.
That makes the rule readable, testable and cheap, and it fails in the safe
direction: a question that trips a pattern is declined and offered a redirect,
which costs a reader one rephrase, where a missed refusal costs considerably
more.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from enum import StrEnum


class RefusalKind(StrEnum):
    """Why the product declined. Each maps to its own redirect in the interface."""

    CLINICAL = "clinical"
    OUTCOME_PREDICTION = "outcome_prediction"
    INDIVIDUAL_LEGAL_OPINION = "individual_legal_opinion"
    DRAFTING = "drafting"
    CONCEALMENT = "concealment"


@dataclass(frozen=True)
class Refusal:
    kind: RefusalKind
    #: The pattern that matched, recorded so a wrong refusal can be traced to
    #: the rule that caused it rather than argued about.
    matched: str


_PATTERNS: tuple[tuple[RefusalKind, str], ...] = (
    # Diagnosis, dosage and treatment. The product says what a regulator
    # requires of a product; it never says what a person should take.
    (
        RefusalKind.CLINICAL,
        r"\b(dosage|dose|doses|how much should (i|we|he|she|they) (take|give)|"
        r"mg per|ml per|treat(s|ment)? for|cure[sd]?|prescrib\w*|diagnos\w*|"
        r"symptom\w*|side effects? (for|in) (me|my)|patient\b|contraindicat\w*)\b",
    ),
    # Predicting the outcome of an application or a proceeding.
    (
        RefusalKind.OUTCOME_PREDICTION,
        r"\b(will|would|can you tell me if) .{0,60}\b"
        r"(be granted|be approved|succeed|win|be rejected|be refused|be allowed)\b",
    ),
    (
        RefusalKind.OUTCOME_PREDICTION,
        r"\b(chances?|odds|likelihood|probability) of (it |this |my |our )?"
        r"(being )?(granted|approved|succeeding|registration|winning)\b",
    ),
    # An opinion on a reader's own dispute is legal advice, not information.
    (
        RefusalKind.INDIVIDUAL_LEGAL_OPINION,
        r"\b(should (i|we) sue|do (i|we) have a case|is (my|our) competitor "
        r"infringing|are we liable|am i liable|advise (me|us) whether|"
        r"legal opinion|represent (me|us))\b",
    ),
    # Drafting an instrument is practising, not informing.
    (
        RefusalKind.DRAFTING,
        r"\b(draft|write|prepare|draw up) (me |us |a |an |the )?.{0,40}"
        r"\b(application|specification|claims?|agreement|contract|notice|"
        r"affidavit|reply|response to the examiner)\b",
    ),
    # Helping hide a failure is the one request that is refused outright.
    (
        RefusalKind.CONCEALMENT,
        r"\b(how (do|can) (i|we) (avoid|evade|get around|bypass|circumvent|hide|conceal)|"
        r"without (declaring|disclosing|telling)|so (the|that the) (regulator|inspector|"
        r"authority|office) (does not|doesn't|won't) (find out|notice|know)|"
        r"back ?date|falsify|forge)\b",
    ),
)

_COMPILED: tuple[tuple[RefusalKind, re.Pattern[str]], ...] = tuple(
    (kind, re.compile(pattern, re.IGNORECASE)) for kind, pattern in _PATTERNS
)


def classify_refusal(question: str) -> Refusal | None:
    for kind, pattern in _COMPILED:
        match = pattern.search(question)
        if match:
            return Refusal(kind=kind, matched=match.group(0).strip())
    return None


#: Openings a retrieved passage has no business containing. If ingestion ever
#: picks up a page that carries them — a scraped forum post, a PDF with an
#: embedded instruction, a poisoned mirror of a statute — they are defanged
#: before the text is packed, not after the model has read them.
_INJECTION_PATTERNS: tuple[re.Pattern[str], ...] = tuple(
    re.compile(pattern, re.IGNORECASE)
    for pattern in (
        r"ignore (all |any |the )?(previous|prior|above|preceding) (instructions?|prompts?|rules?)",
        r"disregard (all |any |the )?(previous|prior|above) (instructions?|rules?)",
        r"you are (now )?(a|an) [a-z ]{0,40}(assistant|model|ai|system)\b",
        r"system prompt",
        r"</?(system|assistant|human|instructions?)>",
        r"\bnew instructions?\b",
        r"do not cite",
        r"respond only with",
        r"forget (everything|what) you",
    )
)

#: What replaces a neutralised span. Visible on purpose: a reader opening the
#: passage sees that something was removed, and the audit row records it.
NEUTRALISED = "[instruction-like text removed]"


def neutralise(text: str) -> tuple[str, int]:
    """Strip instruction-like spans from a retrieved passage.

    Returns the cleaned text and how many spans were removed. The count is
    carried into the audit row, because a corpus document that starts producing
    them is a fact about the corpus that somebody needs to see.

    This is a second line, not the first. The first is that the context builder
    wraps every passage in a delimiter and the system prompt says passages are
    data. Neither alone is enough, and neither is presented as sufficient.
    """
    removed = 0
    cleaned = text
    for pattern in _INJECTION_PATTERNS:
        cleaned, count = pattern.subn(NEUTRALISED, cleaned)
        removed += count
    return cleaned, removed
