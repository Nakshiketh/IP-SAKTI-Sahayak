"""The corpus pipeline: manifest in, index out.

Ingestion has its own package rather than living in `app.services`, because it
has a different lifetime. A service stage happens to one query on its way to one
answer; these stages happen to a document, once, and what they produce outlives
every request. `app.retrieval` reads what this package writes, and the two share
`IndexedChunk` so there is one definition of what a passage is.

The order is fetch, parse, segment, enrich, embed, version, validate, and each
is its own module. Two rules run through all of them:

* **Anything not parsed and validated does not enter the index.** Silence beats
  a wrong citation, so a document that fails a gate is reported and skipped, not
  ingested with the bad field left null.
* **Nothing is guessed.** A source URL, an effective date, a version label and a
  checksum come from the document actually fetched. A manifest entry with none
  of them is not an error — it is the honest state of a source nobody has
  fetched yet — and it is skipped with a reason rather than filled in.
"""

from app.corpus.types import (
    Block,
    DocumentEntry,
    IngestReport,
    ParsedDocument,
    SegmentedChunk,
    StageOutcome,
)

__all__ = [
    "Block",
    "DocumentEntry",
    "IngestReport",
    "ParsedDocument",
    "SegmentedChunk",
    "StageOutcome",
]
