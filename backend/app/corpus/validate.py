"""The gates. Anything not parsed and validated does not enter the index.

Silence beats a wrong citation, so a document that fails one of these is
reported and dropped from the run — not ingested with the bad field left null
and a hope that nothing reads it.

The distinction that matters is between a *failure* and a *skip*. A document
nobody has verified a source URL for is not broken; it is the honest state of a
source that has not been fetched, and the run reports it and moves on. A
document that *was* fetched and cannot say when it took effect is broken, and
the run fails on it, because an answer citing it would carry an as-of date the
corpus cannot support.

`--strict` collapses the distinction, for the case where a build is meant to
produce a complete corpus and a skip is a regression.
"""

from __future__ import annotations

from app.corpus.segment import PREAMBLE
from app.corpus.types import DocumentEntry, Outcome, SegmentedChunk, StageOutcome

VALID_VERIFICATION = frozenset({"verified", "unverified", "demo"})

#: Above this share of a document sitting in the preamble, the chunking profile
#: found no structure at all. Every citation into it would say "Preamble", which
#: is wrong about where the text came from — so the document is rejected rather
#: than indexed with useless section paths.
MAX_PREAMBLE_SHARE = 0.8


def validate_entry(entry: DocumentEntry) -> list[StageOutcome]:
    """Gates on a document that has been fetched and is about to be indexed."""
    problems: list[StageOutcome] = []

    def fail(reason: str) -> None:
        problems.append(StageOutcome("validate", entry.document_id, Outcome.FAILED, reason))

    if entry.effective_from is None:
        fail(
            "no effective_from. An answer citing this would carry an as-of date "
            "the corpus cannot support."
        )
    if not entry.source_url:
        fail("indexed without a source_url, so a reader could not open the source")
    if entry.verification_status not in VALID_VERIFICATION:
        fail("verification_status is " + repr(entry.verification_status))
    if (
        entry.effective_to is not None
        and entry.effective_from is not None
        and entry.effective_to < entry.effective_from
    ):
        fail("effective_to is before effective_from")
    if not entry.checksum:
        fail("no checksum, so a re-ingest could not tell whether the document changed")
    return problems


def validate_chunks(entry: DocumentEntry, chunks: list[SegmentedChunk]) -> list[StageOutcome]:
    problems: list[StageOutcome] = []

    def fail(reason: str, detail: dict | None = None) -> None:
        problems.append(
            StageOutcome("validate", entry.document_id, Outcome.FAILED, reason, detail or {})
        )

    if not chunks:
        fail("parsed to zero chunks, so nothing about it could be cited")
        return problems

    unpathed = [chunk.chunk_id for chunk in chunks if not chunk.section_path]
    if unpathed:
        fail(
            "chunks with no section_path: a citation into one could not say where it came from",
            {"chunk_ids": unpathed[:5], "count": len(unpathed)},
        )

    empty = [chunk.chunk_id for chunk in chunks if not chunk.text.strip()]
    if empty:
        fail("chunks with no text", {"chunk_ids": empty[:5], "count": len(empty)})

    preamble = sum(1 for chunk in chunks if tuple(chunk.section_path) == (PREAMBLE,))
    if preamble / len(chunks) > MAX_PREAMBLE_SHARE:
        fail(
            "the "
            + entry.chunking_profile
            + " profile recognised almost no structure here, so every citation "
            "would say Preamble. The profile is wrong for this document.",
            {"preamble_chunks": preamble, "total_chunks": len(chunks)},
        )

    seen: set[str] = set()
    duplicates = [
        chunk.chunk_id for chunk in chunks if chunk.chunk_id in seen or seen.add(chunk.chunk_id)
    ]
    if duplicates:
        fail("duplicate chunk ids", {"chunk_ids": duplicates[:5]})

    return problems


def unsafe_chunk_ids(chunks: list[SegmentedChunk]) -> list[str]:
    """Chunk ids that would not survive being used as a DOM id.

    A citation id *is* a chunk id, and the interface builds element ids from it.
    Constraining the alphabet here is cheaper than escaping it in three places
    on the other side.
    """
    allowed = set("abcdefghijklmnopqrstuvwxyz0123456789-")
    return [chunk.chunk_id for chunk in chunks if set(chunk.chunk_id) - allowed]
