"""What readers thought of an answer, kept apart from who they are.

Feedback is the one thing this product collects that is an opinion rather than a
fact, and the temptation with opinions is to join them back to people. So this
store holds no session id, no account, no query id and no free text — a row here
says "someone found an answer of this shape partly useful" and nothing that
could identify them or the question they asked.

Query id is left out deliberately, and it is the omission that does the work:
the audit log records a query id against a session, so keeping one here would
re-link the verdict to a person through a join. What is kept instead is the
shape of the answer — its jurisdiction, its confidence, whether it abstained —
which is what makes the feedback useful for finding where the product is weak.

"Which part needs clarification" is a fixed set of choices, not a text box. Free
text about someone's own formulation is exactly the material that must not
accumulate in a table nobody reads.

Never used for automatic training. Nothing reads this back into the pipeline;
it exists so a person can look at where the product is failing readers.
"""

from __future__ import annotations

import sqlite3
import time
from dataclasses import dataclass
from pathlib import Path

#: The three verdicts a reader can give. Deliberately coarse: a five-point
#: scale invites a precision nobody has about whether an answer helped.
VERDICTS = ("yes", "partly", "no")

#: What was unclear, where the reader chose to say. A closed list, so the table
#: never accumulates prose about a person's own product.
ASPECTS = (
    "the_answer",
    "the_sources",
    "what_to_do_next",
    "why_it_could_not_conclude",
    "the_language",
)


@dataclass(frozen=True)
class FeedbackRow:
    verdict: str
    aspect: str | None
    jurisdiction: str | None
    confidence: str | None
    abstained: bool
    created_at: float


class FeedbackStore:
    """A table of opinions with nobody attached to them."""

    def __init__(self, path: Path) -> None:
        self._path = path
        self._ready = False

    def _connect(self) -> sqlite3.Connection:
        self._path.parent.mkdir(parents=True, exist_ok=True)
        connection = sqlite3.connect(self._path)
        connection.row_factory = sqlite3.Row
        if not self._ready:
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS feedback (
                    id           INTEGER PRIMARY KEY AUTOINCREMENT,
                    verdict      TEXT NOT NULL,
                    aspect       TEXT,
                    jurisdiction TEXT,
                    confidence   TEXT,
                    abstained    INTEGER NOT NULL DEFAULT 0,
                    created_at   REAL NOT NULL
                )
                """
            )
            connection.commit()
            self._ready = True
        return connection

    def record(
        self,
        verdict: str,
        *,
        aspect: str | None = None,
        jurisdiction: str | None = None,
        confidence: str | None = None,
        abstained: bool = False,
    ) -> FeedbackRow:
        """Write one opinion. Anything unrecognised is dropped, not stored raw."""
        row = FeedbackRow(
            verdict=verdict if verdict in VERDICTS else "other",
            aspect=aspect if aspect in ASPECTS else None,
            jurisdiction=jurisdiction,
            confidence=confidence,
            abstained=abstained,
            created_at=time.time(),
        )
        with self._connect() as connection:
            connection.execute(
                "INSERT INTO feedback (verdict, aspect, jurisdiction, confidence, abstained,"
                " created_at) VALUES (?, ?, ?, ?, ?, ?)",
                (
                    row.verdict,
                    row.aspect,
                    row.jurisdiction,
                    row.confidence,
                    int(row.abstained),
                    row.created_at,
                ),
            )
            connection.commit()
        return row

    def columns(self) -> list[str]:
        """The stored columns, so a test can assert what is not among them."""
        with self._connect() as connection:
            return [row[1] for row in connection.execute("PRAGMA table_info(feedback)")]

    def summary(self) -> dict[str, int]:
        """Counts by verdict. The only thing this store is read for."""
        with self._connect() as connection:
            rows = connection.execute(
                "SELECT verdict, COUNT(*) AS n FROM feedback GROUP BY verdict"
            ).fetchall()
        return {row["verdict"]: row["n"] for row in rows}
