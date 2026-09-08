"""Getting the document.

Three rules, in order of how expensive they are to get wrong.

**A credentialed source is never fetched here.** Not with a flag, not with a
key, not in a test. `fetch` refuses on `access_mode` before it looks at anything
else, and there is no code path past that refusal. Those sources are reached at
query time, through the reader's own credentials, with logged consent — which is
a different mechanism in a different phase. The same refusal covers
`portal_link_only`: those portals are interactive and session-based, their terms
generally prohibit automated retrieval, and the product links out instead.

**Nothing is guessed.** A row with no `source_url` is skipped with that as the
reason. It is not an error; it is the honest state of a source nobody has
verified a URL for, and inventing one would be the exact fabrication the whole
product is built against.

**The raw bytes are kept, with a checksum.** `corpus/raw/` is gitignored: the
fetch recipe and the checksum are committed, the documents are not, because
this product has no right to redistribute most of them. The checksum is what
makes a re-ingest able to say "unchanged" without re-parsing.
"""

from __future__ import annotations

import hashlib
import shutil
import urllib.error
import urllib.request
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from urllib.parse import unquote, urlparse

from app.corpus.types import AccessMode, DocumentEntry, Outcome, StageOutcome

USER_AGENT = "IP-SAKTI-Sahayak-ingest/0.1 (+corpus pipeline; contact via repository)"
TIMEOUT_SECONDS = 60

#: Extensions the pipeline knows how to store. Anything else is fetched under
#: `.bin` and will fail at the parse gate, which is the right place for it.
EXTENSIONS = {
    "application/pdf": ".pdf",
    "text/html": ".html",
    "application/xhtml+xml": ".html",
    "text/plain": ".txt",
    "application/xml": ".xml",
    "text/xml": ".xml",
}


@dataclass(frozen=True)
class Fetched:
    document_id: str
    path: Path
    checksum: str
    retrieved_at: datetime
    #: True when the bytes on disk were reused rather than downloaded again.
    reused: bool
    content_type: str | None = None


def checksum_of(data: bytes) -> str:
    return "sha256:" + hashlib.sha256(data).hexdigest()


def _suffix_for(entry: DocumentEntry, content_type: str | None, url: str) -> str:
    if content_type:
        base = content_type.split(";")[0].strip().lower()
        if base in EXTENSIONS:
            return EXTENSIONS[base]
    suffix = Path(unquote(urlparse(url).path)).suffix.lower()
    return suffix if suffix in set(EXTENSIONS.values()) else ".bin"


def _existing(raw_dir: Path, document_id: str) -> Path | None:
    matches = sorted(raw_dir.glob(document_id + ".*"))
    return matches[0] if matches else None


def fetch(
    entry: DocumentEntry,
    *,
    raw_dir: Path,
    force: bool = False,
    bases: tuple[Path, ...] = (),
) -> tuple[Fetched | None, StageOutcome]:
    """Get one document.

    A relative ``source_url`` is resolved against ``bases`` in order, the
    manifest's own directory first. That is what makes a manifest portable: a
    manifest and its documents can be copied somewhere else and still describe
    the same files, which they could not if every path were anchored to one
    repository root.
    """
    if entry.access_mode in (AccessMode.USER_CREDENTIALED, AccessMode.PORTAL_LINK_ONLY):
        # Not a configuration question. There is no path past this.
        return None, StageOutcome(
            "fetch",
            entry.document_id,
            Outcome.SKIPPED,
            "access_mode is " + entry.access_mode.value + "; this pipeline never fetches it",
        )

    if not entry.source_url:
        return None, StageOutcome(
            "fetch",
            entry.document_id,
            Outcome.SKIPPED,
            "no source_url has been verified for this document",
        )

    raw_dir.mkdir(parents=True, exist_ok=True)
    existing = _existing(raw_dir, entry.document_id)
    if existing is not None and not force:
        data = existing.read_bytes()
        return (
            Fetched(
                document_id=entry.document_id,
                path=existing,
                checksum=checksum_of(data),
                retrieved_at=entry.retrieved_at or datetime.now(UTC),
                reused=True,
            ),
            StageOutcome("fetch", entry.document_id, Outcome.OK, "reused the stored copy"),
        )

    parsed = urlparse(entry.source_url)
    try:
        if parsed.scheme in ("", "file"):
            data, content_type = _read_local(entry.source_url, bases)
        elif parsed.scheme in ("http", "https"):
            data, content_type = _read_http(entry.source_url)
        else:
            return None, StageOutcome(
                "fetch",
                entry.document_id,
                Outcome.FAILED,
                "unsupported URL scheme: " + parsed.scheme,
            )
    except (OSError, urllib.error.URLError, ValueError) as error:
        return None, StageOutcome(
            "fetch", entry.document_id, Outcome.FAILED, "could not be fetched: " + str(error)
        )

    if not data:
        return None, StageOutcome(
            "fetch", entry.document_id, Outcome.FAILED, "the source returned an empty document"
        )

    target = raw_dir / (entry.document_id + _suffix_for(entry, content_type, entry.source_url))
    if existing is not None and existing != target:
        existing.unlink()
    target.write_bytes(data)

    return (
        Fetched(
            document_id=entry.document_id,
            path=target,
            checksum=checksum_of(data),
            retrieved_at=datetime.now(UTC),
            reused=False,
            content_type=content_type,
        ),
        StageOutcome("fetch", entry.document_id, Outcome.OK, "fetched"),
    )


def _read_local(url: str, bases: tuple[Path, ...]) -> tuple[bytes, str | None]:
    parsed = urlparse(url)
    raw_path = unquote(parsed.path) if parsed.scheme == "file" else url
    path = Path(raw_path)

    if path.is_absolute():
        if not path.exists():
            raise FileNotFoundError(str(path))
        return path.read_bytes(), None

    for base in bases:
        candidate = base / raw_path
        if candidate.exists():
            return candidate.read_bytes(), None
    raise FileNotFoundError(raw_path + " (looked under " + ", ".join(str(b) for b in bases) + ")")


def _read_http(url: str) -> tuple[bytes, str | None]:
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=TIMEOUT_SECONDS) as response:  # noqa: S310
        return response.read(), response.headers.get("Content-Type")


def clear(raw_dir: Path, document_id: str) -> None:
    existing = _existing(raw_dir, document_id)
    if existing is not None:
        existing.unlink()


def clear_all(raw_dir: Path) -> None:
    if raw_dir.exists():
        shutil.rmtree(raw_dir)
