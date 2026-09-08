"""Where chunks come from.

Two stores, one shape. `SqliteChunkStore` reads the index the corpus pipeline
builds in Phase 11 and reports itself unavailable until that file exists.
`DemoChunkStore` reads the committed fixture under `data/fixtures`, every chunk
of which is marked demo.

The registry at the bottom is the only place that decides which store a
jurisdiction reads, and it holds one store per namespace rather than one store
with a jurisdiction column. That is rule 2 made structural: a query cannot reach
the other jurisdiction's passages by forgetting a filter, because they are not in
the store it was handed.
"""

from __future__ import annotations

import json
import sqlite3
from datetime import date
from pathlib import Path
from typing import Protocol

from app.models.domain import (
    IPRight,
    Jurisdiction,
    ProductClass,
    RegulatoryArea,
    VerificationStatus,
)
from app.retrieval.types import IndexedChunk

DEMO_CORPUS_VERSION = "0.0.0-demo"
UNBUILT_CORPUS_VERSION = "0.0.0-unbuilt"


class ChunkStore(Protocol):
    """A namespace's passages, held in memory for the life of the process.

    Two different questions, kept apart because conflating them hid a real
    defect: ``is_fixture`` asks whether this store is the committed JSON stand-in
    rather than a built index, and decides which corpus version an answer
    carries. ``is_demo`` asks whether what it serves is marked demo, and decides
    whether the interface tells the reader so. A built index of demo-verified
    documents is not a fixture — it has a real version — but everything it
    serves is still demo.
    """

    @property
    def available(self) -> bool: ...

    @property
    def corpus_version(self) -> str: ...

    @property
    def is_fixture(self) -> bool: ...

    @property
    def is_demo(self) -> bool: ...

    def chunks(self) -> list[IndexedChunk]: ...

    def document_count(self) -> int: ...


def _parse_date(value: str | None) -> date | None:
    return date.fromisoformat(value) if value else None


def chunk_from_mapping(row: dict, jurisdiction: Jurisdiction) -> IndexedChunk:
    return IndexedChunk(
        chunk_id=row["chunk_id"],
        document_id=row["document_id"],
        document_title=row["document_title"],
        organization=row["organization"],
        jurisdiction=jurisdiction,
        text=row["text"],
        section_path=tuple(row.get("section_path") or ()),
        heading=row.get("heading"),
        page_from=row.get("page_from"),
        source_url=row.get("source_url"),
        version_label=row.get("version_label"),
        document_type=row.get("document_type"),
        verification_status=VerificationStatus(row.get("verification_status", "unverified")),
        effective_from=_parse_date(row.get("effective_from")),
        effective_to=_parse_date(row.get("effective_to")),
        superseded_by=row.get("superseded_by"),
        ip_rights=tuple(IPRight(value) for value in row.get("ip_rights", ())),
        regulatory_areas=tuple(RegulatoryArea(value) for value in row.get("regulatory_areas", ())),
        product_classes=tuple(ProductClass(value) for value in row.get("product_classes", ())),
        conflicts_with=tuple(row.get("conflicts_with") or ()),
        topics=tuple(row.get("topics") or ()),
    )


class DemoChunkStore:
    """The committed demo fixture, filtered to one jurisdiction.

    Everything it returns carries ``verification_status: demo``, and that is what
    makes the rest of the pipeline treat the result as illustrative: the
    generator refuses to write over anything else, and the answer is marked
    ``is_demo`` all the way down to the source card's dashed edge.
    """

    def __init__(self, path: Path, jurisdiction: Jurisdiction) -> None:
        self._path = path
        self._jurisdiction = jurisdiction
        self._loaded: list[IndexedChunk] | None = None

    @property
    def available(self) -> bool:
        return self._path.exists()

    @property
    def corpus_version(self) -> str:
        return DEMO_CORPUS_VERSION

    @property
    def is_fixture(self) -> bool:
        return True

    @property
    def is_demo(self) -> bool:
        return True

    def chunks(self) -> list[IndexedChunk]:
        if self._loaded is None:
            self._loaded = self._load()
        return self._loaded

    def document_count(self) -> int:
        return len({chunk.document_id for chunk in self.chunks()})

    def _load(self) -> list[IndexedChunk]:
        if not self._path.exists():
            return []
        raw = json.loads(self._path.read_text(encoding="utf-8"))
        documents = {entry["document_id"]: entry for entry in raw.get("documents", [])}

        loaded: list[IndexedChunk] = []
        for row in raw.get("chunks", []):
            document = documents.get(row["document_id"])
            if document is None:
                raise ValueError(f"demo chunk names an unknown document: {row['chunk_id']}")
            if document["jurisdiction"] != self._jurisdiction.value:
                continue
            merged = {**document, **row}
            merged["verification_status"] = "demo"
            loaded.append(chunk_from_mapping(merged, self._jurisdiction))
        return loaded


class SqliteChunkStore:
    """The built index. Absent until the corpus pipeline runs.

    Reports itself unavailable rather than raising, so a machine with no index
    still serves the demo store — and says which one it used.
    """

    def __init__(self, path: Path, jurisdiction: Jurisdiction) -> None:
        self._path = path
        self._jurisdiction = jurisdiction
        self._loaded: list[IndexedChunk] | None = None
        self._version = UNBUILT_CORPUS_VERSION

    @property
    def available(self) -> bool:
        return self._path.exists()

    @property
    def corpus_version(self) -> str:
        if self._loaded is None and self.available:
            self.chunks()
        return self._version

    @property
    def is_fixture(self) -> bool:
        return False

    @property
    def is_demo(self) -> bool:
        """True when everything in this built index is marked demo.

        A corpus can be built from illustrative documents. The build is real —
        it has a version, a changelog and section paths — but every source it
        serves is still illustrative, and the reader has to be told.
        """
        chunks = self.chunks()
        return bool(chunks) and all(
            chunk.verification_status is VerificationStatus.DEMO for chunk in chunks
        )

    def chunks(self) -> list[IndexedChunk]:
        if self._loaded is None:
            self._loaded = self._load()
        return self._loaded

    def document_count(self) -> int:
        return len({chunk.document_id for chunk in self.chunks()})

    def _load(self) -> list[IndexedChunk]:
        if not self.available:
            return []
        connection = sqlite3.connect("file:" + str(self._path) + "?mode=ro", uri=True)
        connection.row_factory = sqlite3.Row
        try:
            meta = connection.execute("SELECT value FROM meta WHERE key = 'corpus_version'")
            row = meta.fetchone()
            if row is not None:
                self._version = row["value"]
            rows = connection.execute("SELECT payload FROM chunks").fetchall()
        finally:
            connection.close()
        return [chunk_from_mapping(json.loads(row["payload"]), self._jurisdiction) for row in rows]


class Namespaces:
    """One store per jurisdiction, chosen once at startup.

    A jurisdiction whose real index is built reads it; one whose index is not
    built reads the demo fixture. They are chosen independently, so a half-built
    corpus serves real passages for India and demo passages for International
    without either being able to pass for the other.
    """

    def __init__(self, index_dir: Path, fixtures_dir: Path) -> None:
        self._stores: dict[Jurisdiction, ChunkStore] = {}
        demo_path = fixtures_dir / "demo-corpus.json"
        for jurisdiction in Jurisdiction:
            built = SqliteChunkStore(
                index_dir / ("chunks-" + jurisdiction.value.lower() + ".sqlite3"), jurisdiction
            )
            self._stores[jurisdiction] = (
                built if built.available else DemoChunkStore(demo_path, jurisdiction)
            )

    def store(self, jurisdiction: Jurisdiction) -> ChunkStore:
        return self._stores[jurisdiction]

    def corpus_version(self) -> str:
        """The version to stamp on an answer.

        If any namespace is still on the committed fixture the whole set reports
        the fixture version, because a real corpus version on an answer has to
        mean every source behind it came from that corpus.
        """
        if any(store.is_fixture for store in self._stores.values()):
            return DEMO_CORPUS_VERSION
        versions = {store.corpus_version for store in self._stores.values()}
        return versions.pop() if len(versions) == 1 else "mixed"

    def document_count(self) -> int:
        return sum(store.document_count() for store in self._stores.values())

    def is_demo(self) -> bool:
        """True when any namespace is serving illustrative content."""
        return any(store.is_demo for store in self._stores.values())

    def is_fixture(self) -> bool:
        """True when any namespace is still the committed JSON stand-in."""
        return any(store.is_fixture for store in self._stores.values())
