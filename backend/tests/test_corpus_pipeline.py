"""The ingest run, end to end, over the committed sample manifest.

The sample documents are fictional instruments of a fictional territory. That is
not squeamishness: a fixture that read like a real statute would eventually be
quoted as one, and this repository has a standing rule against authoring text
that could be mistaken for law.

The last test in this file is the one that matters across phases — it asserts
that what ingestion writes is exactly what retrieval reads, by building an index
and then querying it through the real `Namespaces` and `Retriever`.
"""

from __future__ import annotations

import json
from datetime import date
from pathlib import Path

import pytest

from app.corpus import fetch as fetch_stage
from app.corpus import index as index_stage
from app.corpus.manifest import Manifest
from app.corpus.pipeline import Paths, ingest
from app.corpus.types import AccessMode, Outcome
from app.models.domain import Jurisdiction
from app.retrieval.store import Namespaces
from app.retrieval.types import RetrievalFilters
from app.services.retrieval import Retriever

REPO_ROOT = Path(__file__).resolve().parents[2]
SAMPLES = REPO_ROOT / "corpus" / "samples" / "manifest.json"


@pytest.fixture
def workspace(tmp_path) -> Paths:
    """A run that writes nowhere near the repository's own corpus."""
    manifest_home = tmp_path / "manifest-home"
    manifest_home.mkdir()
    return Paths(
        repo_root=REPO_ROOT,
        manifest_dir=SAMPLES.parent,
        raw_dir=manifest_home / "raw",
        work_dir=tmp_path / "work",
        index_dir=tmp_path / "index",
        changelog=manifest_home / "CHANGELOG.md",
        tags_review=manifest_home / "tags-review.jsonl",
    )


def build(workspace: Paths, **kwargs):
    return ingest(Manifest.load(SAMPLES), workspace, today=date(2026, 1, 1), **kwargs)


# -- a run -------------------------------------------------------------------


def test_a_run_builds_an_index_from_the_manifest(workspace: Paths) -> None:
    report = build(workspace)
    assert not report.failed
    assert report.documents_indexed == 3
    assert report.chunks_written > 0
    assert index_stage.index_path(workspace.index_dir, "IN").exists()
    assert index_stage.index_path(workspace.index_dir, "INTL").exists()


def test_the_two_jurisdictions_are_separate_files(workspace: Paths) -> None:
    """Rule 2, made structural: there is no filter to forget."""
    build(workspace)
    india = index_stage.read_index(index_stage.index_path(workspace.index_dir, "IN"))
    other = index_stage.read_index(index_stage.index_path(workspace.index_dir, "INTL"))
    assert india and other
    assert set(india) & set(other) == set()
    assert {row["document_id"] for row in other.values()} == {"sample-convention-2019"}


def test_a_second_run_changes_nothing(workspace: Paths) -> None:
    first = build(workspace)
    before = index_stage.read_index(index_stage.index_path(workspace.index_dir, "IN"))
    second = build(workspace)
    after = index_stage.read_index(index_stage.index_path(workspace.index_dir, "IN"))

    assert set(before) == set(after)
    assert first.chunks_written == second.chunks_written
    changelog = workspace.changelog.read_text(encoding="utf-8")
    assert "No section changed" in changelog


def test_the_version_advances_from_the_last_build_not_from_the_manifest(
    workspace: Paths,
) -> None:
    versions = [build(workspace).corpus_version for _ in range(3)]
    assert versions == ["0.1.0", "0.1.1", "0.1.2"]


def test_the_run_reuses_a_parse_whose_bytes_have_not_changed(workspace: Paths) -> None:
    build(workspace)
    report = build(workspace)
    reasons = [o.reason for o in report.outcomes if o.stage == "parse"]
    assert all("cached" in reason for reason in reasons)


def test_forcing_a_run_redoes_the_work(workspace: Paths) -> None:
    build(workspace)
    report = build(workspace, force=True)
    reasons = [o.reason for o in report.outcomes if o.stage == "parse"]
    assert all("cached" not in reason for reason in reasons)


# -- refusals and skips ------------------------------------------------------


def test_a_credentialed_source_is_never_fetched_even_with_a_working_url(
    workspace: Paths,
) -> None:
    """The refusal is on access_mode, not on whether a fetch would succeed."""
    manifest = Manifest.load(SAMPLES)
    credentialed = manifest.by_id("sample-credentialed-source")
    assert credentialed is not None
    assert credentialed.access_mode is AccessMode.USER_CREDENTIALED
    assert credentialed.source_url, "the fixture carries a resolvable URL on purpose"

    report = build(workspace)
    outcome = next(o for o in report.outcomes if o.document_id == "sample-credentialed-source")
    assert outcome.stage == "fetch"
    assert outcome.outcome is Outcome.SKIPPED
    assert "never fetches it" in outcome.reason

    india = index_stage.read_index(index_stage.index_path(workspace.index_dir, "IN"))
    other = index_stage.read_index(index_stage.index_path(workspace.index_dir, "INTL"))
    everything = {**india, **other}
    assert not any(
        row["document_id"] == "sample-credentialed-source" for row in everything.values()
    )


def test_a_relative_source_url_is_resolved_against_the_manifest_first(
    workspace: Paths,
) -> None:
    """A manifest and its documents can be copied together and still work."""
    entry = Manifest.load(SAMPLES).by_id("sample-instruments-act-2020")
    assert entry is not None
    assert "/" not in (entry.source_url or ""), "the sample manifest names files beside itself"
    fetched, _outcome = fetch_stage.fetch(
        entry, raw_dir=workspace.raw_dir, bases=(SAMPLES.parent, REPO_ROOT)
    )
    assert fetched is not None


def test_a_document_with_no_verified_url_is_skipped_with_that_as_the_reason(
    workspace: Paths, tmp_path
) -> None:
    raw = json.loads(SAMPLES.read_text(encoding="utf-8"))
    for row in raw["documents"]:
        row["source_url"] = None
    path = tmp_path / "no-urls.json"
    path.write_text(json.dumps(raw), encoding="utf-8")

    report = ingest(Manifest.load(path), workspace, today=date(2026, 1, 1))
    assert not report.failed
    assert report.chunks_written == 0
    assert all("no source_url" in o.reason or "never fetches" in o.reason for o in report.skips())


def test_strict_turns_a_skip_into_a_failure(workspace: Paths, tmp_path) -> None:
    raw = json.loads(SAMPLES.read_text(encoding="utf-8"))
    for row in raw["documents"]:
        row["source_url"] = None
    path = tmp_path / "no-urls.json"
    path.write_text(json.dumps(raw), encoding="utf-8")

    assert ingest(Manifest.load(path), workspace, strict=True, today=date(2026, 1, 1)).failed


# -- validation fails loudly -------------------------------------------------


def broken(tmp_path: Path, **overrides) -> Path:
    raw = json.loads(SAMPLES.read_text(encoding="utf-8"))
    raw["documents"] = [
        row for row in raw["documents"] if row["document_id"] == "sample-instruments-act-2020"
    ]
    raw["documents"][0].update(overrides)
    path = tmp_path / "broken.json"
    path.write_text(json.dumps(raw), encoding="utf-8")
    return path


@pytest.mark.parametrize(
    ("overrides", "expected"),
    [
        ({"effective_from": None}, "effective_from"),
        ({"chunking_profile": "treaty_article_aware"}, "recognised almost no structure"),
        ({"source_url": "does-not-exist.txt"}, "could not be fetched"),
    ],
)
def test_a_deliberately_broken_entry_fails_loudly(
    workspace: Paths, tmp_path, overrides: dict, expected: str
) -> None:
    report = ingest(Manifest.load(broken(tmp_path, **overrides)), workspace, today=date(2026, 1, 1))
    assert report.failed
    assert any(expected in problem.reason for problem in report.failures())
    assert report.chunks_written == 0


def test_an_unknown_parser_is_reported_rather_than_crashing(workspace: Paths, tmp_path) -> None:
    report = ingest(
        Manifest.load(broken(tmp_path, parser="magic")), workspace, today=date(2026, 1, 1)
    )
    assert report.failed
    assert any("unknown parser" in problem.reason for problem in report.failures())


def test_a_manifest_with_a_duplicate_document_id_is_rejected(tmp_path) -> None:
    raw = json.loads(SAMPLES.read_text(encoding="utf-8"))
    raw["documents"].append(dict(raw["documents"][0]))
    path = tmp_path / "duplicate.json"
    path.write_text(json.dumps(raw), encoding="utf-8")
    with pytest.raises(ValueError, match="duplicate document_id"):
        Manifest.load(path)


# -- what the run writes back ------------------------------------------------


def test_the_run_records_what_it_learned_and_nothing_it_did_not(workspace: Paths, tmp_path) -> None:
    raw = json.loads(SAMPLES.read_text(encoding="utf-8"))
    path = tmp_path / "writable.json"
    path.write_text(json.dumps(raw, indent=2), encoding="utf-8")

    manifest = Manifest.load(path)
    ingest(manifest, workspace, today=date(2026, 1, 1))

    after = json.loads(path.read_text(encoding="utf-8"))
    row = next(r for r in after["documents"] if r["document_id"] == "sample-instruments-act-2020")
    assert row["checksum"].startswith("sha256:")
    assert row["retrieved_at"]
    # A machine cannot promote a document to verified. Verified means a person
    # read it against the source.
    assert row["verification_status"] == "demo"


def test_the_tag_review_queue_is_written_beside_its_own_manifest(workspace: Paths) -> None:
    build(workspace)
    assert workspace.tags_review.exists()
    rows = [
        json.loads(line)
        for line in workspace.tags_review.read_text(encoding="utf-8").splitlines()
        if line
    ]
    assert rows
    assert all(row["reviewed"] is False for row in rows)


# -- the contract with retrieval ---------------------------------------------


def test_retrieval_reads_exactly_what_ingestion_writes(workspace: Paths) -> None:
    """The cross-phase contract, asserted by using both halves for real."""
    build(workspace)

    namespaces = Namespaces(workspace.index_dir, workspace.repo_root / "data" / "fixtures")
    store = namespaces.store(Jurisdiction.IN)
    assert store.available is True
    # A built index of illustrative documents: not a fixture, so it carries a
    # real version, but everything it serves is still marked demo.
    assert store.is_fixture is False
    assert store.is_demo is True
    assert namespaces.corpus_version() == "0.1.0"

    result = Retriever().retrieve(
        "what must a licence to manufacture at premises contain",
        store,
        filters=RetrievalFilters(effective_on=date(2026, 1, 1)),
        candidates=30,
        keep=8,
        on=date(2026, 1, 1),
    )
    assert result.passages, "the built index has to be searchable"

    best = result.passages[0].chunk
    assert best.document_title.endswith("(illustrative)")
    assert best.section_path, "a citation has to be able to say where it came from"
    assert best.verification_status.value == "demo"
    assert best.effective_from is not None


def test_a_built_index_takes_over_from_the_committed_fixture(workspace: Paths) -> None:
    fixtures = workspace.repo_root / "data" / "fixtures"
    before = Namespaces(workspace.index_dir, fixtures)
    assert before.is_fixture() is True
    assert before.corpus_version() == "0.0.0-demo"

    build(workspace)
    after = Namespaces(workspace.index_dir, fixtures)
    assert after.is_fixture() is False
    assert after.corpus_version() == "0.1.0"
    assert after.document_count() == 3
    # Still illustrative documents, so the reader is still told.
    assert after.is_demo() is True


# -- fetching ----------------------------------------------------------------


def test_a_fetch_is_reused_until_it_is_forced(workspace: Paths) -> None:
    entry = Manifest.load(SAMPLES).by_id("sample-instruments-act-2020")
    assert entry is not None

    bases = (SAMPLES.parent, REPO_ROOT)
    first, _outcome = fetch_stage.fetch(entry, raw_dir=workspace.raw_dir, bases=bases)
    assert first is not None and first.reused is False

    second, _outcome = fetch_stage.fetch(entry, raw_dir=workspace.raw_dir, bases=bases)
    assert second is not None and second.reused is True
    assert second.checksum == first.checksum

    third, _outcome = fetch_stage.fetch(entry, raw_dir=workspace.raw_dir, bases=bases, force=True)
    assert third is not None and third.reused is False


def test_a_checksum_changes_when_the_bytes_change() -> None:
    assert fetch_stage.checksum_of(b"one") != fetch_stage.checksum_of(b"two")
    assert fetch_stage.checksum_of(b"one") == fetch_stage.checksum_of(b"one")
