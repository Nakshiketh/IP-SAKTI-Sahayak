"""Layer 2 — records. Evidential, never authority.

A record answers *what has been filed, granted or registered*. A corpus passage
answers *what is required*. The first is evidence about somebody's application;
the second is a statement of law. This package is separate from `app.corpus` and
`app.retrieval` because that distinction has to survive contact with a codebase,
and the surest way to keep two things apart is to give them different homes.

Four properties are structural here rather than remembered:

* **No embeddings, ever.** Records are tabular, far larger than the corpus and
  semantically thin. Putting them in the vector index would pollute retrieval and
  produce citations that look authoritative and are not law. There is no
  embedding code in this package and nothing here writes to `data/index/`.
* **`citable_in_answers` is `Literal[False]`** on the domain model, so no code
  path can promote a record into a citation.
* **Snapshots are append-only.** A record is never mutated in place. A new
  snapshot supersedes the old one, and what a previous snapshot said stays
  readable.
* **A portal-only source has no fetcher.** Not a disabled one — none. The
  ingestion module refuses on `access_mode` before it reads anything else, and a
  test greps the repository to keep it that way.
"""

from app.records.types import (
    AggregateStatistic,
    RecordAccessMode,
    RecordSource,
    Snapshot,
    StoredRecord,
)

__all__ = [
    "AggregateStatistic",
    "RecordAccessMode",
    "RecordSource",
    "Snapshot",
    "StoredRecord",
]
