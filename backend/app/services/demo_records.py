"""Layer 2, before Layer 2 exists.

The records layer proper arrives in Phase 12. Until then this returns the demo
records from the fixture, and only when the store serving the answer is itself
the demo store — a real corpus with no records loaded returns nothing, which is
the truth.

Every record carries ``citable_in_answers`` pinned false by the domain model, so
nothing here can be promoted into a citation by any code path. What it is for is
the surface beside the answer: records exist, they are evidence of what somebody
filed, and they are shown next to an abstention exactly as readily as next to an
answer, because their presence must not look like it changes anything.
"""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

from app.models.domain import Jurisdiction, Record, RecordType
from app.retrieval.tokenize import fold, tokenize
from app.services.records_service import RECORD_TRIGGER_WORDS

#: A record is offered when the question is about the kind of thing that gets
#: filed. Not a search — a filter over two fixture rows.
#: The same vocabulary the real records service uses, folded to match the
#: tokeniser. One list, because two would drift — and the drift showed up in the
#: gold set as records appearing beside a question when the store was loaded and
#: not when the fixture stood in for it.
_TRIGGERS = frozenset(fold(word) for word in RECORD_TRIGGER_WORDS)


@lru_cache(maxsize=4)
def _load(path: str) -> tuple[Record, ...]:
    raw = json.loads(Path(path).read_text(encoding="utf-8"))
    return tuple(
        Record(
            record_id=row["record_id"],
            source_id=row["source_id"],
            jurisdiction=Jurisdiction(row["jurisdiction"]),
            record_type=RecordType(row["record_type"]),
            title=row["title"],
            applicant=row.get("applicant"),
            status=row.get("status"),
        )
        for row in raw.get("records", [])
    )


def demo_records(question: str, fixtures_dir: Path) -> tuple[Record, ...]:
    path = fixtures_dir / "demo-answers.json"
    if not path.exists():
        return ()
    if not set(tokenize(question)) & _TRIGGERS:
        return ()
    return _load(str(path))
