"""The ingest run: manifest in, index out.

Idempotent and resumable, in the ordinary sense rather than the clever one. Each
document's intermediate artefacts are written next to each other under
`data/chunks/`, keyed by the checksum of the bytes they came from, so a second
run reuses the parse and the segmentation of every document whose file has not
changed. `--force` throws that away.

Resumable because a document that fails takes only itself down. The run collects
outcomes, keeps going, and reports every one at the end. A corpus of 37 sources
where one has moved should not be a build that produces nothing.

The whole run is written into a temporary index and moved into place at the end,
so a failed run leaves the previous corpus serving rather than a half-built one.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import asdict, dataclass
from datetime import date
from pathlib import Path

from app.corpus import fetch as fetch_stage
from app.corpus import index as index_stage
from app.corpus import validate as validate_stage
from app.corpus import version as version_stage
from app.corpus.embed import Embedder, NullEmbedder
from app.corpus.enrich import LLMTagger, enrich
from app.corpus.manifest import Manifest
from app.corpus.parse import get_parser
from app.corpus.segment import get_profile, segment
from app.corpus.types import (
    Block,
    DocumentEntry,
    IngestReport,
    Outcome,
    ParsedDocument,
    SegmentedChunk,
    StageOutcome,
)


@dataclass(frozen=True)
class Paths:
    repo_root: Path
    #: The manifest's own directory. A relative source_url is resolved against
    #: this before the repository root, so a manifest is portable.
    manifest_dir: Path
    raw_dir: Path
    work_dir: Path
    index_dir: Path
    changelog: Path
    tags_review: Path

    @classmethod
    def for_manifest(
        cls, repo_root: Path, manifest_path: Path, *, index_dir: Path | None = None
    ) -> Paths:
        """Everything a run writes, derived from the manifest it is building.

        The changelog and the tag-review queue sit beside their own manifest, so
        a build from the sample manifest cannot append to the real corpus's
        changelog. Raw files and the parse cache are keyed by document id and
        namespaced the same way for the same reason.
        """
        home = manifest_path.parent
        # The parse cache is keyed by the manifest's full path, not its folder
        # name, so two manifests that happen to sit in folders with the same
        # name cannot read each other's cached parses.
        fingerprint = hashlib.sha256(str(manifest_path.resolve()).encode()).hexdigest()[:8]
        return cls(
            repo_root=repo_root,
            manifest_dir=home,
            raw_dir=home / "raw",
            work_dir=repo_root / "data" / "chunks" / (home.name + "-" + fingerprint),
            index_dir=index_dir or (repo_root / "data" / "index"),
            changelog=home / "CHANGELOG.md",
            tags_review=home / "tags-review.jsonl",
        )


def _cache_path(paths: Paths, document_id: str) -> Path:
    return paths.work_dir / (document_id + ".json")


def _load_cached(paths: Paths, document_id: str, checksum: str) -> list[SegmentedChunk] | None:
    path = _cache_path(paths, document_id)
    if not path.exists():
        return None
    cached = json.loads(path.read_text(encoding="utf-8"))
    if cached.get("checksum") != checksum:
        return None
    return [_chunk_from_cache(row) for row in cached["chunks"]]


def _as_date(value: str | None) -> date | None:
    return date.fromisoformat(value) if value else None


def _chunk_from_cache(row: dict) -> SegmentedChunk:
    return SegmentedChunk(
        chunk_id=row["chunk_id"],
        document_id=row["document_id"],
        text=row["text"],
        section_path=tuple(row["section_path"]),
        heading=row["heading"],
        page_from=row["page_from"],
        page_to=row["page_to"],
        token_count=row["token_count"],
        content_hash=row.get("content_hash", ""),
        section_key=row.get("section_key", ""),
        ip_rights=tuple(row.get("ip_rights") or ()),
        regulatory_areas=tuple(row.get("regulatory_areas") or ()),
        product_classes=tuple(row.get("product_classes") or ()),
        effective_from=_as_date(row.get("effective_from")),
        effective_to=_as_date(row.get("effective_to")),
        embedding_ref=row.get("embedding_ref"),
        conflicts_with=tuple(row.get("conflicts_with") or ()),
        topics=tuple(row.get("topics") or ()),
    )


def _save_cached(
    paths: Paths, document_id: str, checksum: str, chunks: list[SegmentedChunk]
) -> None:
    paths.work_dir.mkdir(parents=True, exist_ok=True)
    rows = []
    for chunk in chunks:
        row = asdict(chunk)
        row["section_path"] = list(chunk.section_path)
        row["ip_rights"] = list(chunk.ip_rights)
        row["regulatory_areas"] = list(chunk.regulatory_areas)
        row["product_classes"] = list(chunk.product_classes)
        row["conflicts_with"] = list(chunk.conflicts_with)
        row["topics"] = list(chunk.topics)
        row["effective_from"] = chunk.effective_from.isoformat() if chunk.effective_from else None
        row["effective_to"] = chunk.effective_to.isoformat() if chunk.effective_to else None
        rows.append(row)
    _cache_path(paths, document_id).write_text(
        json.dumps({"checksum": checksum, "chunks": rows}, ensure_ascii=False),
        encoding="utf-8",
        newline="\n",
    )


def parse_document(entry: DocumentEntry, path: Path) -> tuple[ParsedDocument | None, StageOutcome]:
    try:
        parser = get_parser(entry.parser)
    except KeyError as error:
        return None, StageOutcome("parse", entry.document_id, Outcome.FAILED, str(error))

    if not parser.available:
        return None, StageOutcome(
            "parse",
            entry.document_id,
            Outcome.SKIPPED,
            "the " + parser.name + " parser needs a dependency that is not installed",
        )

    try:
        parsed = parser.parse(path, entry.document_id)
    except Exception as error:  # noqa: BLE001 - a parser failure is a document failure
        return None, StageOutcome(
            "parse", entry.document_id, Outcome.FAILED, "could not be parsed: " + str(error)
        )

    if not parsed.blocks:
        return None, StageOutcome(
            "parse", entry.document_id, Outcome.FAILED, "parsed to no text at all"
        )
    return parsed, StageOutcome(
        "parse",
        entry.document_id,
        Outcome.OK,
        str(len(parsed.blocks)) + " blocks",
        {"ocr": parsed.ocr, "ocr_confidence": parsed.ocr_confidence},
    )


def ingest(
    manifest: Manifest,
    paths: Paths,
    *,
    only: tuple[str, ...] = (),
    force: bool = False,
    strict: bool = False,
    embedder: Embedder | None = None,
    write_review: bool = True,
    write_back: bool = True,
    today: date | None = None,
) -> IngestReport:
    report = IngestReport(corpus_version=manifest.corpus_version)
    embed = embedder or NullEmbedder()
    when = today or date.today()

    entries = manifest.select(only)
    per_document: list[tuple[DocumentEntry, list[SegmentedChunk]]] = []
    manifest_updates: dict[str, dict] = {}
    review_rows: list[dict] = []
    reviewer = LLMTagger(paths.tags_review)

    for entry in entries:
        fetched, outcome = fetch_stage.fetch(
            entry,
            raw_dir=paths.raw_dir,
            force=force,
            bases=(paths.manifest_dir, paths.repo_root),
        )
        report.add(outcome)
        if fetched is None:
            continue

        # Everything the fetch learned, written back so the next run can tell
        # what has changed. verification_status is never touched here.
        entry = _with_fetch(entry, fetched)
        manifest_updates[entry.document_id] = {
            "retrieved_at": fetched.retrieved_at.isoformat(),
            "checksum": fetched.checksum,
        }

        chunks = None if force else _load_cached(paths, entry.document_id, fetched.checksum)
        if chunks is None:
            parsed, parse_outcome = parse_document(entry, fetched.path)
            report.add(parse_outcome)
            if parsed is None:
                continue

            try:
                profile = get_profile(entry.chunking_profile)
            except KeyError as error:
                report.add(StageOutcome("segment", entry.document_id, Outcome.FAILED, str(error)))
                continue

            chunks = segment(parsed, profile)
            report.add(
                StageOutcome(
                    "segment",
                    entry.document_id,
                    Outcome.OK,
                    str(len(chunks)) + " chunks",
                    {"profile": profile.name},
                )
            )

            chunks, proposals = enrich(chunks, entry, review=reviewer if write_review else None)
            review_rows.extend(proposals)
            report.add(
                StageOutcome("enrich", entry.document_id, Outcome.OK, "tagged from the lexicon")
            )
            _save_cached(paths, entry.document_id, fetched.checksum, chunks)
        else:
            report.add(
                StageOutcome("parse", entry.document_id, Outcome.OK, "reused the cached parse")
            )
            report.add(
                StageOutcome(
                    "segment", entry.document_id, Outcome.OK, str(len(chunks)) + " chunks (cached)"
                )
            )
            if write_review:
                review_rows.extend(reviewer.propose(chunk, entry) for chunk in chunks)

        chunks = version_stage.with_effective_from(chunks, entry)

        embedded = embed.embed(chunks, entry.jurisdiction)
        chunks = list(embedded.chunks)
        report.add(
            StageOutcome(
                "embed",
                entry.document_id,
                Outcome.OK if embed.available else Outcome.SKIPPED,
                (
                    str(embedded.vectors_written) + " vectors"
                    if embed.available
                    else "no embedding model is configured; the dense channel stays off"
                ),
            )
        )

        problems = validate_stage.validate_entry(entry) + validate_stage.validate_chunks(
            entry, chunks
        )
        unsafe = validate_stage.unsafe_chunk_ids(chunks)
        if unsafe:
            problems.append(
                StageOutcome(
                    "validate",
                    entry.document_id,
                    Outcome.FAILED,
                    "chunk ids outside the safe alphabet",
                    {"chunk_ids": unsafe[:5]},
                )
            )
        if problems:
            for problem in problems:
                report.add(problem)
            continue

        report.add(StageOutcome("validate", entry.document_id, Outcome.OK, "all gates passed"))
        per_document.append((entry, chunks))

    if write_review and review_rows:
        reviewer.write(review_rows)

    _write_indexes(manifest, paths, per_document, report, when=when)

    if strict:
        for skip in list(report.skips()):
            report.add(
                StageOutcome(
                    skip.stage,
                    skip.document_id,
                    Outcome.FAILED,
                    "--strict: " + skip.reason,
                )
            )

    if manifest_updates and write_back:
        manifest.write_back(manifest_updates)

    return report


def _with_fetch(entry: DocumentEntry, fetched: fetch_stage.Fetched) -> DocumentEntry:
    from dataclasses import replace

    return replace(entry, checksum=fetched.checksum, retrieved_at=fetched.retrieved_at)


def _write_indexes(
    manifest: Manifest,
    paths: Paths,
    per_document: list[tuple[DocumentEntry, list[SegmentedChunk]]],
    report: IngestReport,
    *,
    when: date,
) -> None:
    """One index per jurisdiction, each diffed against its own previous build."""
    by_jurisdiction: dict[str, list[tuple[DocumentEntry, list[SegmentedChunk]]]] = {}
    for entry, chunks in per_document:
        by_jurisdiction.setdefault(entry.jurisdiction, []).append((entry, chunks))

    titles = {entry.document_id: entry.title for entry in manifest.entries}
    all_diffs: list[version_stage.DocumentDiff] = []
    moved = False
    written = 0
    documents = 0

    # The version to bump from is the one the last build produced, not the one
    # written in the manifest. Reading it from the manifest would restart the
    # sequence on every run and make two answers citing different corpora look
    # like they cited the same one.
    built_versions = {
        index_stage.read_meta(index_stage.index_path(paths.index_dir, jurisdiction)).get(
            "corpus_version"
        )
        for jurisdiction in by_jurisdiction
    }
    previous_version = next(
        (version for version in sorted(filter(None, built_versions), reverse=True)),
        manifest.corpus_version,
    )

    # One pass to learn whether anything moved anywhere, so both namespaces are
    # stamped with the same corpus version. Two indexes carrying different
    # versions of the same corpus would make an answer's version meaningless.
    staged: list[tuple[str, Path, version_stage.VersionResult]] = []
    for jurisdiction, group in by_jurisdiction.items():
        path = index_stage.index_path(paths.index_dir, jurisdiction)
        result = version_stage.apply_versions(group, index_stage.read_index(path), closed_on=when)
        staged.append((jurisdiction, path, result))
        all_diffs.extend(result.diffs)
        moved = moved or result.moved

    moved_overall = moved
    for jurisdiction, path, result in staged:
        entry_by_id = {entry.document_id: entry for entry in manifest.entries}
        rows = [
            (chunk, entry_by_id[chunk.document_id])
            for chunk in result.chunks
            if chunk.document_id in entry_by_id
        ]
        written += index_stage.write_index(
            path,
            rows,
            corpus_version=version_stage.bump(previous_version, moved=moved_overall),
            embedder=None,
        )
        documents += len({chunk.document_id for chunk, _entry in rows})
        report.add(
            StageOutcome(
                "index",
                jurisdiction,
                Outcome.OK,
                str(len(rows)) + " chunks written to " + path.name,
                {"retained": result.retained},
            )
        )

    report.chunks_written = written
    report.documents_indexed = documents

    if by_jurisdiction:
        report.corpus_version = version_stage.bump(previous_version, moved=moved_overall)
        version_stage.write_changelog(
            paths.changelog,
            corpus_version=report.corpus_version,
            diffs=all_diffs,
            on=when,
            titles=titles,
        )


def make_parsed(document_id: str, blocks: list[Block], parser: str = "text") -> ParsedDocument:
    """Small helper for tests and for anything driving the stages by hand."""
    return ParsedDocument(document_id=document_id, blocks=tuple(blocks), parser=parser)
