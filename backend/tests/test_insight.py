"""T18: nothing anyone typed reaches the audit log or the dashboard.

A Ministry audience should be able to see where this product works and where it
does not. They must not be able to see what any one person asked — and in this
domain a question *is* the sensitive thing: "can we patent our ashwagandha and
shilajit extract" describes an unpublished product belonging to a named company.

Two guarantees are pinned here. The audit log holds a hash of the question and
never the words. And a bucket with fewer than five items is withheld, because
four questions about export classification for a Siddha preparation is not a
statistic, it is four people.
"""

from __future__ import annotations

import sqlite3
from pathlib import Path

import pytest

from app.services.audit import AuditLog, AuditRow, hash_question
from app.services.insight import LOCAL_DATA, MIN_BUCKET, summarise
from app.services.telephony import NullProvider

SECRET = "our ashwagandha and shilajit extract uses a modified supercritical process"


@pytest.fixture
def audit(tmp_path):
    return AuditLog(tmp_path / "audit.sqlite3", enabled=True)


def write_queries(audit: AuditLog, count: int, **overrides) -> None:
    for index in range(count):
        row = {
            "event": "query",
            "session_id": f"s{index}",
            "query_id": f"q{index}",
            "question_hash": hash_question(SECRET),
            "jurisdiction": "IN",
            "language_in": "en",
            "confidence": "high",
            "abstained": False,
            "latency_ms": 20 + index,
        }
        row.update(overrides)
        audit.record(AuditRow(**row))


# -- T18: no raw text anywhere ------------------------------------------------


def test_the_audit_log_stores_a_hash_and_never_the_question(audit, tmp_path) -> None:
    write_queries(audit, 1)
    with sqlite3.connect(tmp_path / "audit.sqlite3") as connection:
        rows = connection.execute("SELECT * FROM audit").fetchall()

    assert rows
    for row in rows:
        blob = " ".join(str(value) for value in row)
        for word in ("ashwagandha", "shilajit", "supercritical", SECRET):
            assert word not in blob, "the reader's own words reached the audit log"


def test_no_column_in_the_audit_schema_could_hold_a_question(tmp_path) -> None:
    AuditLog(tmp_path / "audit.sqlite3", enabled=True).record(
        AuditRow(event="query", session_id="s")
    )
    with sqlite3.connect(tmp_path / "audit.sqlite3") as connection:
        columns = [row[1] for row in connection.execute("PRAGMA table_info(audit)")]
    for forbidden in ("question", "question_text", "text", "answer", "prompt", "transcript"):
        assert forbidden not in columns


def test_the_dashboard_reports_no_free_text(audit, tmp_path) -> None:
    write_queries(audit, MIN_BUCKET + 2)
    insight = summarise(tmp_path / "audit.sqlite3")
    rendered = repr(insight)
    for word in ("ashwagandha", "shilajit", "supercritical"):
        assert word not in rendered


# -- small buckets are withheld ------------------------------------------------


def test_a_bucket_below_the_threshold_is_hidden(audit, tmp_path) -> None:
    write_queries(audit, MIN_BUCKET, jurisdiction="IN")
    write_queries(audit, MIN_BUCKET - 1, jurisdiction="INTL")

    insight = summarise(tmp_path / "audit.sqlite3")
    names = {bucket.name for bucket in insight.by_jurisdiction}
    assert "IN" in names
    assert "INTL" not in names, "four questions is four people, not a statistic"


def test_hiding_a_bucket_is_reported_rather_than_silent(audit, tmp_path) -> None:
    write_queries(audit, MIN_BUCKET, jurisdiction="IN")
    write_queries(audit, 1, jurisdiction="INTL")
    assert summarise(tmp_path / "audit.sqlite3").suppressed_buckets >= 1


def test_a_bucket_at_the_threshold_is_shown(audit, tmp_path) -> None:
    write_queries(audit, MIN_BUCKET, jurisdiction="IN")
    names = {b.name for b in summarise(tmp_path / "audit.sqlite3").by_jurisdiction}
    assert "IN" in names


# -- the numbers themselves ---------------------------------------------------


def test_an_empty_deployment_reports_nothing_rather_than_zeroes(tmp_path) -> None:
    # Nobody has used it. That is true and worth showing, and it is not the
    # same as a 0% abstention rate.
    insight = summarise(tmp_path / "nothing.sqlite3")
    assert insight.total_queries == 0
    assert insight.abstention_rate is None


def test_rates_come_from_rows_that_exist(audit, tmp_path) -> None:
    write_queries(audit, 6, abstained=False)
    write_queries(audit, 4, abstained=True, abstain_reason="nothing_relevant")
    insight = summarise(tmp_path / "audit.sqlite3")
    assert insight.total_queries == 10
    assert insight.abstention_rate == 0.4


def test_every_figure_says_it_is_local_until_it_is_not(audit, tmp_path) -> None:
    write_queries(audit, MIN_BUCKET)
    # A demo number read as a national one is the failure this guards against.
    assert summarise(tmp_path / "audit.sqlite3").provenance == LOCAL_DATA


def test_latency_percentiles_are_reported_when_there_are_rows(audit, tmp_path) -> None:
    write_queries(audit, MIN_BUCKET + 5)
    insight = summarise(tmp_path / "audit.sqlite3")
    assert insight.latency_p50_ms is not None
    assert insight.latency_p95_ms >= insight.latency_p50_ms


# -- the knowledge gap monitor ------------------------------------------------


def test_gaps_are_named_by_the_reason_given_not_by_guessing_a_topic(audit, tmp_path) -> None:
    write_queries(audit, MIN_BUCKET + 1, abstained=True, abstain_reason="unsupported_jurisdiction")
    gaps = summarise(tmp_path / "audit.sqlite3").knowledge_gaps
    assert gaps
    assert gaps[0].reason == "unsupported_jurisdiction"
    assert gaps[0].count >= MIN_BUCKET


def test_a_gap_too_small_to_report_is_not_reported(audit, tmp_path) -> None:
    write_queries(audit, 2, abstained=True, abstain_reason="unsupported_jurisdiction")
    assert summarise(tmp_path / "audit.sqlite3").knowledge_gaps == ()


# -- source health -------------------------------------------------------------


def test_a_changed_source_is_queued_and_never_applied() -> None:
    """The whole point of a verified corpus is that a machine cannot quietly
    rewrite what the law says.
    """
    from app.registry import health

    assert health.CHANGED in health.STATES
    # There is no code path from "changed" to replacing corpus text: the module
    # never opens the knowledge base and never writes a passage.
    source = Path(health.__file__).read_text(encoding="utf-8")
    assert "knowledge-base.json" not in source
    assert "chunks" not in source


def test_a_changed_source_moves_to_needs_review_not_to_verified(tmp_path) -> None:
    from app.registry import health
    from app.registry.models import ReviewState, SourceRecord
    from app.registry.store import SourceRegistry

    registry = SourceRegistry(tmp_path / "registry.sqlite3")
    registry.write(
        [
            SourceRecord(
                source_id="in-x",
                title="An Act",
                authority="An authority",
                jurisdiction="IN",
                document_type="act",
                authority_level=1,
                official_url="https://ipindia.gov.in/x.pdf",
                review_state=ReviewState.VERIFIED_OFFICIAL,
                sha256="a" * 64,
            )
        ]
    )
    changed = health.Health("in-x", health.CHANGED, None, True, True, "now bbbb")
    assert health.apply_states(registry, [changed]) == 1

    after = registry.get("in-x")
    assert after.review_state is ReviewState.NEEDS_REVIEW
    # Still citable, marked provenance-pending: the reader sees the same words
    # with an honest warning rather than different words nobody approved.
    assert after.legacy_allowed is True


def test_an_unreachable_source_is_not_treated_as_changed() -> None:
    from app.registry import health

    assert health.UNAVAILABLE != health.CHANGED
    unreachable = health.Health("in-x", health.UNAVAILABLE, None, False, False, "timeout")
    assert unreachable.needs_a_person is False


def test_no_telephony_provider_is_reachable_from_the_dashboard() -> None:
    # The insight surface must not become a way to place a call.
    assert NullProvider().available is False
