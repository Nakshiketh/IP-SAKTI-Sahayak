"""Packing passages for the generator.

Three things happen here, and the order matters.

**Neutralising.** Every passage goes through `guardrails.neutralise` before it is
packed. Retrieved text is evidence, not instruction, and a document that carries
instruction-like wording — a scraped page, a poisoned mirror, a PDF with
something embedded in it — must not reach the model with that wording intact.
The count of removals is carried out of here into the audit row.

**Diversity.** The budget is spent across documents, not down one. Without this,
one long act fills the window, every claim in the answer cites the same
document, and the confidence rule correctly downgrades an answer that could have
been better sourced. The cap is a share of the budget rather than a passage
count, because passages differ enormously in length.

**Labelling.** Each passage is packed under a header naming its document, its
section path, its version and its effective date, and inside an explicit
delimiter. The header is what makes attribution possible at all: a model cannot
cite a section path it was never shown. The delimiter is what makes the
"passages are data" instruction in the system prompt mean something.

Token counting is by whitespace-and-punctuation words, not by any model's
tokeniser. It is an estimate, it is documented as one, and it is deliberately
conservative: the budget is a guard against overflow, and a guard that needs the
exact tokeniser of whichever model is configured would be a guard that breaks
when the model changes.
"""

from __future__ import annotations

from dataclasses import dataclass

from app.retrieval.types import ScoredChunk
from app.services.guardrails import neutralise

#: Words per token. English prose runs a little under one token per word and
#: Indic scripts run well over; 1.4 tokens per word is the conservative end of
#: that range, which is the side to be wrong on.
TOKENS_PER_WORD = 1.4

PASSAGE_OPEN = '<passage id="{chunk_id}">'
PASSAGE_CLOSE = "</passage>"


def estimate_tokens(text: str) -> int:
    return int(len(text.split()) * TOKENS_PER_WORD) + 1


@dataclass(frozen=True)
class PackedPassage:
    chunk_id: str
    document_id: str
    text: str
    tokens: int
    #: Instruction-like spans removed from this passage before packing.
    neutralised_spans: int


@dataclass(frozen=True)
class Context:
    passages: tuple[PackedPassage, ...]
    prompt_text: str
    tokens_used: int
    #: Passages that were retrieved but did not fit the budget.
    dropped: tuple[str, ...]
    neutralised_spans: int

    @property
    def chunk_ids(self) -> tuple[str, ...]:
        return tuple(passage.chunk_id for passage in self.passages)


def _header(passage: ScoredChunk) -> str:
    chunk = passage.chunk
    lines = [
        "document: " + chunk.document_title,
        "organization: " + chunk.organization,
        "jurisdiction: " + chunk.jurisdiction.value,
    ]
    if chunk.section_label:
        lines.append("section: " + chunk.section_label)
    if chunk.version_label:
        lines.append("version: " + chunk.version_label)
    if chunk.effective_from:
        lines.append("in force from: " + chunk.effective_from.isoformat())
    if chunk.effective_to:
        lines.append("in force to: " + chunk.effective_to.isoformat())
    lines.append("verification: " + chunk.verification_status.value)
    return "\n".join(lines)


def build_context(
    passages: list[ScoredChunk],
    *,
    token_budget: int,
    max_share_per_document: float,
) -> Context:
    per_document_cap = max(1, int(token_budget * max_share_per_document))
    spent_by_document: dict[str, int] = {}
    packed: list[PackedPassage] = []
    dropped: list[str] = []
    total = 0
    removed_total = 0

    for passage in passages:
        chunk = passage.chunk
        cleaned, removed = neutralise(chunk.text)
        block = "\n".join(
            [
                PASSAGE_OPEN.format(chunk_id=chunk.chunk_id),
                _header(passage),
                "",
                cleaned,
                PASSAGE_CLOSE,
            ]
        )
        cost = estimate_tokens(block)
        spent = spent_by_document.get(chunk.document_id, 0)

        if total + cost > token_budget or spent + cost > per_document_cap:
            dropped.append(chunk.chunk_id)
            continue

        packed.append(
            PackedPassage(
                chunk_id=chunk.chunk_id,
                document_id=chunk.document_id,
                text=block,
                tokens=cost,
                neutralised_spans=removed,
            )
        )
        spent_by_document[chunk.document_id] = spent + cost
        total += cost
        removed_total += removed

    return Context(
        passages=tuple(packed),
        prompt_text="\n\n".join(passage.text for passage in packed),
        tokens_used=total,
        dropped=tuple(dropped),
        neutralised_spans=removed_total,
    )
