"""System-level numbers, from audit rows and nothing else.

What a Ministry audience wants to know is where this is used, where it works and
where it does not. What they must not be able to see is what any one person
asked. The audit log was built for that: it holds a hash of the question, never
the words, so there is nothing here to leak even by accident.

Two rules shape every number below.

**Small buckets are hidden.** A category with four questions in it is not a
statistic, it is four people — and in a domain this specific ("export
classification for a Siddha preparation") a bucket of one is close to naming
someone. Anything under the threshold is reported as suppressed, with the fact
that it was suppressed, rather than silently dropped.

**Nothing is inferred.** A rate is computed from rows that exist or it is not
reported. Where there is no production data, the caller is told the data is
local, so a demo number is never read as a national one.
"""

from __future__ import annotations

import sqlite3
from collections import Counter
from dataclasses import dataclass, field
from pathlib import Path

#: Below this, a bucket describes people rather than usage.
MIN_BUCKET = 5

#: The label every figure carries until this runs against a real deployment.
LOCAL_DATA = "Local / demo data"


@dataclass(frozen=True)
class Bucket:
    name: str
    count: int


@dataclass(frozen=True)
class Gap:
    """A category of question the corpus could not answer.

    Named by the reason the product gave, not by guessing at a topic: the
    honest statement is "eleven questions reached a legal system this corpus
    does not cover", not a claim about what those questions were about.
    """

    reason: str
    count: int


@dataclass(frozen=True)
class Insight:
    total_queries: int
    #: Counts by jurisdiction, language and abstention reason, small buckets removed.
    by_jurisdiction: tuple[Bucket, ...] = ()
    by_language: tuple[Bucket, ...] = ()
    by_abstain_reason: tuple[Bucket, ...] = ()
    most_used_sources: tuple[Bucket, ...] = ()
    #: How many buckets were withheld for being too small to report.
    suppressed_buckets: int = 0
    abstention_rate: float | None = None
    escalation_rate: float | None = None
    refusal_rate: float | None = None
    latency_p50_ms: int | None = None
    latency_p95_ms: int | None = None
    #: Always set until this runs against production.
    provenance: str = LOCAL_DATA
    #: Abstentions grouped into the gaps they represent.
    knowledge_gaps: tuple[Gap, ...] = field(default_factory=tuple)


def _buckets(counter: Counter[str]) -> tuple[tuple[Bucket, ...], int]:
    kept = [Bucket(name, n) for name, n in counter.most_common() if n >= MIN_BUCKET]
    return tuple(kept), len(counter) - len(kept)


def _percentile(values: list[int], fraction: float) -> int | None:
    if not values:
        return None
    ordered = sorted(values)
    index = min(int(len(ordered) * fraction), len(ordered) - 1)
    return ordered[index]


def summarise(audit_path: Path, *, provenance: str = LOCAL_DATA) -> Insight:
    """Read the audit log and report what can be reported.

    A missing or empty log is not an error. It means nobody has used this
    deployment, which is a true and useful thing to show.
    """
    if not audit_path.exists():
        return Insight(total_queries=0, provenance=provenance)

    with sqlite3.connect(audit_path) as connection:
        connection.row_factory = sqlite3.Row
        try:
            rows = connection.execute(
                "SELECT jurisdiction, language_in, abstained, abstain_reason, refusal_kind,"
                " latency_ms, passage_ids FROM audit WHERE event = 'query'"
            ).fetchall()
        except sqlite3.DatabaseError:
            return Insight(total_queries=0, provenance=provenance)

    total = len(rows)
    if total == 0:
        return Insight(total_queries=0, provenance=provenance)

    jurisdictions: Counter[str] = Counter()
    languages: Counter[str] = Counter()
    reasons: Counter[str] = Counter()
    sources: Counter[str] = Counter()
    latencies: list[int] = []
    abstained = refused = 0

    for row in rows:
        if row["jurisdiction"]:
            jurisdictions[row["jurisdiction"]] += 1
        if row["language_in"]:
            languages[row["language_in"]] += 1
        if row["abstained"]:
            abstained += 1
            reasons[row["abstain_reason"] or "unstated"] += 1
        if row["refusal_kind"]:
            refused += 1
        if row["latency_ms"] is not None:
            latencies.append(int(row["latency_ms"]))
        for passage in (row["passage_ids"] or "").split(","):
            # Passage ids are corpus identifiers, not anybody's words.
            document = passage.strip().rsplit("-", 1)[0]
            if document:
                sources[document] += 1

    by_jurisdiction, dropped_j = _buckets(jurisdictions)
    by_language, dropped_l = _buckets(languages)
    by_reason, dropped_r = _buckets(reasons)
    by_source, dropped_s = _buckets(sources)

    return Insight(
        total_queries=total,
        by_jurisdiction=by_jurisdiction,
        by_language=by_language,
        by_abstain_reason=by_reason,
        most_used_sources=by_source,
        suppressed_buckets=dropped_j + dropped_l + dropped_r + dropped_s,
        abstention_rate=round(abstained / total, 3),
        refusal_rate=round(refused / total, 3),
        latency_p50_ms=_percentile(latencies, 0.5),
        latency_p95_ms=_percentile(latencies, 0.95),
        provenance=provenance,
        knowledge_gaps=tuple(Gap(reason=bucket.name, count=bucket.count) for bucket in by_reason),
    )
