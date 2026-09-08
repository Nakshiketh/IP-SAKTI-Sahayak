"""Reading the manifest.

`corpus/manifest.json` is the single source of truth for what the product
intends to answer from, and it is read here rather than trusted: a row naming an
unknown parser, an unknown chunking profile or an unknown access mode is a build
error, not something to discover halfway through a fetch.

The manifest is also *written* here, at the end of a run — the fields that can
only be known from the document itself (`source_url` stays as given, but
`retrieved_at`, `checksum`, and any dates the parser recovered) are written back
so the next run can tell what has changed. Nothing else is ever written back;
in particular `verification_status` is never promoted by a machine, because
"verified" means a person checked it.
"""

from __future__ import annotations

import json
from datetime import date, datetime
from pathlib import Path

from app.corpus.types import AccessMode, DocumentEntry

VALID_VERIFICATION = frozenset({"verified", "unverified", "demo"})


def _as_date(value: str | None) -> date | None:
    return date.fromisoformat(value) if value else None


def _as_datetime(value: str | None) -> datetime | None:
    return datetime.fromisoformat(value) if value else None


def entry_from_row(row: dict) -> DocumentEntry:
    tags = row.get("tags") or {}
    status = row.get("verification_status", "unverified")
    if status not in VALID_VERIFICATION:
        raise ValueError(
            "unknown verification_status " + repr(status) + " for " + row["document_id"]
        )
    return DocumentEntry(
        document_id=row["document_id"],
        title=row["title"],
        organization=row["organization"],
        jurisdiction=row["jurisdiction"],
        regime_family=row["regime_family"],
        document_type=row["document_type"],
        parser=row["parser"],
        chunking_profile=row["chunking_profile"],
        access_mode=AccessMode(row.get("access_mode", "open")),
        short_title=row.get("short_title"),
        language=row.get("language", "en"),
        source_url=row.get("source_url"),
        version_label=row.get("version_label"),
        effective_from=_as_date(row.get("effective_from")),
        effective_to=_as_date(row.get("effective_to")),
        supersedes=tuple(row.get("supersedes") or ()),
        superseded_by=row.get("superseded_by"),
        publication_date=_as_date(row.get("publication_date")),
        retrieved_at=_as_datetime(row.get("retrieved_at")),
        verification_status=status,
        checksum=row.get("checksum"),
        licence=row.get("licence"),
        attribution_text=row.get("attribution_text"),
        ip_rights=tuple(tags.get("ip_rights") or ()),
        regulatory_areas=tuple(tags.get("regulatory_areas") or ()),
        product_classes=tuple(tags.get("product_classes") or ()),
        notes=row.get("notes"),
    )


class Manifest:
    def __init__(self, path: Path, raw: dict) -> None:
        self.path = path
        self.raw = raw
        self.corpus_version: str = raw.get("corpus_version", "0.0.0-unbuilt")
        self.entries: list[DocumentEntry] = [
            entry_from_row(row) for row in raw.get("documents", [])
        ]
        seen: set[str] = set()
        for entry in self.entries:
            if entry.document_id in seen:
                raise ValueError("duplicate document_id in manifest: " + entry.document_id)
            seen.add(entry.document_id)

    @classmethod
    def load(cls, path: Path) -> Manifest:
        return cls(path, json.loads(path.read_text(encoding="utf-8")))

    def by_id(self, document_id: str) -> DocumentEntry | None:
        return next((e for e in self.entries if e.document_id == document_id), None)

    def select(self, only: tuple[str, ...] = ()) -> list[DocumentEntry]:
        if not only:
            return list(self.entries)
        wanted = set(only)
        unknown = wanted - {entry.document_id for entry in self.entries}
        if unknown:
            raise ValueError("no such document in the manifest: " + ", ".join(sorted(unknown)))
        return [entry for entry in self.entries if entry.document_id in wanted]

    def write_back(self, updates: dict[str, dict]) -> None:
        """Record what the fetch learned, and nothing else.

        Only the fields a machine can honestly fill are written: when it was
        retrieved, what it hashed to, and dates the parser recovered from the
        document itself. `verification_status` is never touched here — a
        machine cannot promote a document to verified, because verified means a
        person read it against the source.
        """
        writable = {
            "retrieved_at",
            "checksum",
            "version_label",
            "effective_from",
            "effective_to",
            "publication_date",
        }
        for row in self.raw.get("documents", []):
            update = updates.get(row["document_id"])
            if not update:
                continue
            for key, value in update.items():
                if key in writable and value is not None:
                    row[key] = value
        self.path.write_text(
            json.dumps(self.raw, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
        )
