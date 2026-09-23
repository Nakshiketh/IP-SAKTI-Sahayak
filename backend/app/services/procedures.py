"""Turning a procedural question into the whole procedure, in order.

"How do I patent this?" is answered badly by the three passages that happen to
score highest: the reader needs every step, in the order they happen, with the
form and the portal for each. The guidance corpus marks which passages belong
to a procedure and at which step, so when a question is procedural and
retrieval lands on a procedure, the rest of that procedure's passages are
brought in beside what was retrieved.

Two rules keep this honest. Only passages from the same store are added — they
are verified passages like any other, so every step still points at a source.
And confidence is scored before expansion, from what retrieval actually found:
expanding cannot turn a weak retrieval into a confident answer.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime

from app.retrieval.store import KnowledgeChunkStore
from app.retrieval.tokenize import tokenize
from app.retrieval.types import ScoredChunk

#: Words that ask how to do something, and so make a question procedural. A
#: question that only mentions registering or filing ("can we register this
#: name?") is a yes-or-no question, and is answered from its best passages.
_PROCEDURAL = frozenset(
    token
    for word in (
        "how",
        "steps",
        "step",
        "process",
        "procedure",
        "apply",
        "applying",
        "get",
        "obtain",
        "after",
        "next",
        "timeline",
        "route",
        "stages",
    )
    for token in tokenize(word, drop_stopwords=False)
)

#: Words that make a procedural question about one step rather than the route:
#: "which documents", "where do I file", "how do I check". Such a question gets
#: that step's passages together, not every step.
_FOCUSED = frozenset(
    token
    for word in (
        "documents",
        "document",
        "forms",
        "form",
        "fee",
        "fees",
        "cost",
        "check",
        "search",
        "already",
        "where",
        "who",
        "which",
        "portal",
        "office",
        "long",
        "deadline",
        "respond",
        "reply",
    )
    for token in tokenize(word, drop_stopwords=False)
)

#: Words that ask for the route as a whole, overriding the focused reading.
_WHOLE_ROUTE = frozenset(
    token
    for word in ("steps", "process", "procedure", "route", "stages", "timeline", "after", "next")
    for token in tokenize(word, drop_stopwords=False)
)

#: How many of the best-scoring passages are looked at for a procedure step.
_LOOK_AT = 5


def _today():
    return datetime.now(UTC).date()


def _words(text: str) -> list[str]:
    return tokenize(text, drop_stopwords=False)


def _contains(words: list[str], phrase: str) -> bool:
    run = _words(phrase)
    return bool(run) and any(
        words[index : index + len(run)] == run for index in range(len(words) - len(run) + 1)
    )


@dataclass(frozen=True)
class Expansion:
    passages: list[ScoredChunk]
    #: Set when the passages are a whole procedure, to be written as steps.
    procedure_id: str | None = None
    #: How many leading passages answer the question; the rest are related.
    lead: int | None = None


def expand_procedure(
    question: str,
    passages: list[ScoredChunk],
    store: object,
    *,
    floor: float,
) -> Expansion:
    """The passages to pack, with a procedure expanded in step order.

    Returns ``passages`` unchanged when the store is not the guidance corpus,
    the question is not procedural, or retrieval did not land on a procedure.
    A question about one step gets that step's passages grouped at the top
    instead of the whole route.
    """
    if not isinstance(store, KnowledgeChunkStore) or not passages:
        return Expansion(passages)
    # Outside a procedure, a passage far weaker than the best one is a stray
    # word match rather than an answer; leave it out of what the reader reads.
    best = max((p.rerank_score or 0.0) for p in passages)
    relevant = [p for p in passages if (p.rerank_score or 0.0) >= _ANSWER_SHARE * best]
    unchanged = Expansion(relevant if len(relevant) < len(passages) else passages)
    words = _words(question)
    if not _PROCEDURAL.intersection(words) and not _FOCUSED.intersection(words):
        return unchanged

    knowledge = store.knowledge
    strong = [p for p in passages[:_LOOK_AT] if (p.rerank_score or 0.0) >= floor]
    procedure = None
    for passage in strong:
        meta = knowledge.meta.get(passage.chunk.chunk_id)
        if meta is None or meta.procedure is None:
            continue
        candidate = knowledge.procedures.get(meta.procedure)
        if candidate is None:
            continue
        if any(_contains(words, trigger) for trigger in candidate.triggers):
            procedure = candidate
            break
    if procedure is None:
        return unchanged

    focused = bool(_FOCUSED.intersection(words)) and not _WHOLE_ROUTE.intersection(words)
    if focused:
        focus = _focus(words, passages, store, procedure.procedure_id, floor)
        return focus or unchanged

    start = 1
    after = _words("after")[0]
    for index, word in enumerate(words[:-1]):
        if word == after:
            following = words[index + 1 : index + 3]
            for key, step in procedure.after.items():
                if any(token in following for token in _words(key)):
                    start = max(start, step)

    trigger_score = max((p.rerank_score or 0.0) for p in strong)
    retrieved = {p.chunk.chunk_id: p for p in passages}
    steps: list[ScoredChunk] = []
    for chunk_id in knowledge.steps(procedure.procedure_id):
        meta = knowledge.meta[chunk_id]
        if (meta.step or 0) < start:
            continue
        existing = retrieved.get(chunk_id)
        if existing is not None and (existing.rerank_score or 0.0) >= floor:
            steps.append(existing)
            continue
        chunk = store.chunk(chunk_id)
        if chunk is None or not chunk.within_effective_window(_today()):
            continue
        steps.append(
            ScoredChunk(
                chunk=chunk,
                retrieval_score=existing.retrieval_score if existing else 0.0,
                rerank_score=trigger_score,
                channels=("procedure",),
            )
        )

    in_steps = {p.chunk.chunk_id for p in steps}
    others = [
        p
        for p in passages
        if p.chunk.chunk_id not in in_steps
        and knowledge.meta.get(p.chunk.chunk_id) is not None
        and knowledge.meta[p.chunk.chunk_id].procedure != procedure.procedure_id
        and (p.rerank_score or 0.0) >= floor
    ]
    return Expansion(steps + others[:3], procedure.procedure_id)


#: A related passage must score at least this share of the best one to be shown
#: beside a focused answer.
_RELATED_SHARE = 0.6
#: Outside a procedure, a passage scoring under this share of the best one is
#: left out of the answer.
_ANSWER_SHARE = 0.5


def _topic_overlap(words: list[str], passage: ScoredChunk) -> int:
    """How many of the question's words the passage's own topics and heading use.

    The reranker saturates at 1.0 for several passages of a procedure; this
    breaks the tie in favour of the passage that is about what was asked.
    """
    labels = set(_words(" ".join((*passage.chunk.topics, passage.chunk.heading or ""))))
    return len(labels.intersection(words))


def _focus(
    words: list[str],
    passages: list[ScoredChunk],
    store: KnowledgeChunkStore,
    procedure_id: str,
    floor: float,
) -> Expansion | None:
    """The best-matching step with all its passages first, then a few related.

    Passages from other steps and other procedures are left out: a question
    about the documents for a patent is not answered with trade mark documents
    or with the renewal step.
    """
    knowledge = store.knowledge
    in_procedure = [
        p
        for p in passages
        if (p.rerank_score or 0.0) >= floor
        and knowledge.meta.get(p.chunk.chunk_id) is not None
        and knowledge.meta[p.chunk.chunk_id].procedure == procedure_id
    ]
    if not in_procedure:
        return None
    top = max(
        in_procedure,
        key=lambda p: (round(p.rerank_score or 0.0, 1), _topic_overlap(words, p)),
    )
    step = knowledge.meta[top.chunk.chunk_id].step
    retrieved = {p.chunk.chunk_id: p for p in passages}
    grouped: list[ScoredChunk] = []
    for chunk_id in knowledge.steps(procedure_id):
        if knowledge.meta[chunk_id].step != step:
            continue
        existing = retrieved.get(chunk_id)
        if existing is not None and (existing.rerank_score or 0.0) >= floor:
            grouped.append(existing)
            continue
        chunk = store.chunk(chunk_id)
        if chunk is not None and chunk.within_effective_window(_today()):
            grouped.append(
                ScoredChunk(
                    chunk=chunk,
                    retrieval_score=existing.retrieval_score if existing else 0.0,
                    rerank_score=top.rerank_score,
                    channels=("procedure",),
                )
            )
    in_group = {p.chunk.chunk_id for p in grouped}
    best = max((p.rerank_score or 0.0) for p in passages)
    related = [
        p
        for p in passages
        if p.chunk.chunk_id not in in_group
        and knowledge.meta.get(p.chunk.chunk_id) is not None
        and knowledge.meta[p.chunk.chunk_id].procedure is None
        and (p.rerank_score or 0.0) >= max(floor, _RELATED_SHARE * best)
    ]
    return Expansion(grouped + related[:2], lead=len(grouped))
