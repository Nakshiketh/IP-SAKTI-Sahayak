"""Versioning: what changed since last time, and what happens to what changed.

This is the stage that makes "kept current" a fact rather than a claim. Law
changes, and a corpus that silently replaced yesterday's wording with today's
would leave every past answer uncheckable and every citation ambiguous about
which text it pointed at.

So a re-ingest diffs against the built index and does three things:

* **Unchanged sections keep their chunk ids.** A chunk id is a section key plus
  a content hash, so identical wording produces an identical id without anything
  being compared. A link to a passage survives a re-ingest of an unamended act.
* **Changed sections get a new chunk, and the old one is retained** with
  `effective_to` set to the ingest date. It stays in the index, still
  retrievable, marked out of its effective window — which is what lets the
  product say "what I found on this has been superseded" instead of "I found
  nothing". Those are different things to tell a reader.
* **Removed sections are retained the same way.** A section repealed out of an
  act does not vanish from the record.

`corpus/CHANGELOG.md` is written for a person, not a machine: one dated entry
per run, naming the documents and the sections, so somebody can see that the law
moved without reading a database.
"""

from __future__ import annotations

from dataclasses import dataclass, field, replace
from datetime import date
from pathlib import Path

from app.corpus.types import DocumentEntry, SegmentedChunk


@dataclass
class DocumentDiff:
    document_id: str
    added: list[str] = field(default_factory=list)
    changed: list[str] = field(default_factory=list)
    removed: list[str] = field(default_factory=list)
    unchanged: int = 0

    @property
    def moved(self) -> bool:
        return bool(self.added or self.changed or self.removed)


@dataclass
class VersionResult:
    #: What goes into the new index: the current chunks, plus every retained
    #: chunk from a previous version with its effective_to set.
    chunks: list[SegmentedChunk]
    diffs: list[DocumentDiff]
    retained: int = 0

    @property
    def moved(self) -> bool:
        return any(diff.moved for diff in self.diffs)


def _as_date(value: str | None) -> date | None:
    return date.fromisoformat(value) if value else None


def _label(payload: dict) -> str:
    path = payload.get("section_path") or []
    if path:
        return " › ".join(path)
    return payload.get("heading") or payload.get("chunk_id", "")


def _chunk_from_payload(payload: dict, closed_on: date, *, close: bool) -> SegmentedChunk:
    """Rebuild a previous chunk so it can be carried into the new index.

    ``close`` is the whole question. A chunk being carried because its section
    changed or went away is closed as of this run. A chunk being carried because
    its document simply was not re-ingested is carried untouched — closing those
    would retire a corpus every time somebody ingested one document.
    """
    previously_closed = payload.get("effective_to")
    return SegmentedChunk(
        chunk_id=payload["chunk_id"],
        document_id=payload["document_id"],
        text=payload["text"],
        section_path=tuple(payload.get("section_path") or ()),
        heading=payload.get("heading"),
        page_from=payload.get("page_from"),
        page_to=payload.get("page_to"),
        token_count=payload.get("token_count", 0),
        content_hash=payload.get("content_hash", ""),
        section_key=payload.get("section_key", ""),
        ip_rights=tuple(payload.get("ip_rights") or ()),
        regulatory_areas=tuple(payload.get("regulatory_areas") or ()),
        product_classes=tuple(payload.get("product_classes") or ()),
        effective_from=_as_date(payload.get("effective_from")),
        # Already closed on a previous run? Keep the earlier date; a section
        # does not stop being superseded because it was seen again.
        effective_to=_as_date(previously_closed) or (closed_on if close else None),
        conflicts_with=tuple(payload.get("conflicts_with") or ()),
        topics=tuple(payload.get("topics") or ()),
    )


def diff_document(
    entry: DocumentEntry,
    current: list[SegmentedChunk],
    previous: dict[str, dict],
    *,
    closed_on: date,
) -> tuple[list[SegmentedChunk], DocumentDiff]:
    """Diff one document. `previous` is every chunk in the built index."""
    was = {
        payload.get("section_key") or chunk_id: payload
        for chunk_id, payload in previous.items()
        if payload.get("document_id") == entry.document_id
    }
    now = {chunk.section_key or chunk.chunk_id: chunk for chunk in current}

    diff = DocumentDiff(document_id=entry.document_id)
    carried: list[SegmentedChunk] = []

    for key, chunk in now.items():
        before = was.get(key)
        if before is None:
            diff.added.append(_label({"section_path": list(chunk.section_path)}) or key)
        elif before.get("chunk_id") == chunk.chunk_id:
            diff.unchanged += 1
        else:
            diff.changed.append(_label(before))
            # The superseded wording stays, closed as of today.
            carried.append(_chunk_from_payload(before, closed_on, close=True))

    for key, before in was.items():
        if key in now:
            continue
        if before.get("effective_to"):
            # Already closed on an earlier run. Carry it forward unchanged.
            carried.append(_chunk_from_payload(before, closed_on, close=False))
            continue
        diff.removed.append(_label(before))
        carried.append(_chunk_from_payload(before, closed_on, close=True))

    return carried, diff


def apply_versions(
    per_document: list[tuple[DocumentEntry, list[SegmentedChunk]]],
    previous: dict[str, dict],
    *,
    closed_on: date | None = None,
) -> VersionResult:
    closed = closed_on or date.today()
    chunks: list[SegmentedChunk] = []
    diffs: list[DocumentDiff] = []
    retained = 0

    ingested = {entry.document_id for entry, _chunks in per_document}

    for entry, current in per_document:
        carried, diff = diff_document(entry, current, previous, closed_on=closed)
        chunks.extend(current)
        chunks.extend(carried)
        retained += len(carried)
        diffs.append(diff)

    # A document that was not re-ingested this run keeps whatever the index
    # already held for it, untouched. A partial run must not delete a corpus.
    for payload in previous.values():
        if payload.get("document_id") not in ingested:
            chunks.append(_chunk_from_payload(payload, closed, close=False))

    return VersionResult(chunks=chunks, diffs=diffs, retained=retained)


def bump(previous_version: str, *, moved: bool) -> str:
    """Next corpus version. Patch when nothing moved, minor when something did.

    Deliberately crude. The version's job is to let an answer say which corpus
    it relied on and to let two answers be compared; it is not a semantic
    promise about compatibility, and pretending otherwise would invite somebody
    to read meaning into a number nobody sets deliberately.
    """
    base = previous_version.split("-")[0]
    parts = base.split(".")
    try:
        major, minor, patch = (int(part) for part in (parts + ["0", "0", "0"])[:3])
    except ValueError:
        major, minor, patch = 0, 0, 0
    if moved:
        return str(major) + "." + str(minor + 1) + ".0"
    return str(major) + "." + str(minor) + "." + str(patch + 1)


def write_changelog(
    path: Path,
    *,
    corpus_version: str,
    diffs: list[DocumentDiff],
    on: date | None = None,
    titles: dict[str, str] | None = None,
) -> None:
    """Append one dated entry. Written for a person to read."""
    when = (on or date.today()).isoformat()
    names = titles or {}
    moved = [diff for diff in diffs if diff.moved]

    lines = ["## " + corpus_version + " — " + when, ""]
    if not moved:
        lines.append("No section changed. " + str(len(diffs)) + " document(s) re-ingested.")
    for diff in moved:
        lines.append("### " + names.get(diff.document_id, diff.document_id))
        if diff.added:
            lines.append("- Added: " + "; ".join(sorted(diff.added)))
        if diff.changed:
            lines.append(
                "- Changed, previous wording retained and closed: "
                + "; ".join(sorted(diff.changed))
            )
        if diff.removed:
            lines.append(
                "- No longer present, retained and closed: " + "; ".join(sorted(diff.removed))
            )
        lines.append("- Unchanged: " + str(diff.unchanged))
        lines.append("")

    entry = "\n".join(lines).rstrip() + "\n"

    header = (
        "# Corpus changelog\n\n"
        "Written by the version stage on every ingest. Newest first. A section "
        "whose wording changed keeps its previous text in the index, closed as "
        "of the date below, so an answer can say the position has moved rather "
        "than that it found nothing.\n\n"
    )
    existing = path.read_text(encoding="utf-8") if path.exists() else header
    body = existing[len(header) :] if existing.startswith(header) else existing
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(header + entry + "\n" + body.lstrip("\n"), encoding="utf-8", newline="\n")


def with_effective_from(chunks: list[SegmentedChunk], entry: DocumentEntry) -> list[SegmentedChunk]:
    """Give every chunk the document's effective window where it has none."""
    return [
        replace(
            chunk,
            effective_from=chunk.effective_from or entry.effective_from,
            effective_to=chunk.effective_to or entry.effective_to,
        )
        for chunk in chunks
    ]
