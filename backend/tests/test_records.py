"""The records layer.

Half of these are tests that something *cannot* happen. That is the shape of
this phase: records are the one kind of data in the product that would do real
damage if it drifted into the answer path, and the defences are structural
rather than procedural. A test that asserts a defence is absent from the schema,
or that a function's signature cannot accept a record, is testing the thing that
actually holds.
"""

from __future__ import annotations

import json
from datetime import UTC, date, datetime
from pathlib import Path

import pytest

from app.records.ingest import (
    MAX_NULL_SHARE,
    check_schema,
    ingest_aggregates,
    ingest_source,
    map_rows,
    read_rows,
)
from app.records.manifest import RecordsManifest
from app.records.portal import build_link, links_for, template_placeholders
from app.records.store import SCHEMA, RecordsStore
from app.records.types import AggregateStatistic, RecordAccessMode, Snapshot
from app.services.records_service import EVIDENCE_LABEL, RecordsService

REPO_ROOT = Path(__file__).resolve().parents[2]
SAMPLES = REPO_ROOT / "corpus" / "samples" / "records-manifest.json"
REAL = REPO_ROOT / "corpus" / "records-manifest.json"
WHEN = datetime(2026, 1, 1, tzinfo=UTC)


@pytest.fixture
def store(tmp_path) -> RecordsStore:
    return RecordsStore(tmp_path / "records.sqlite3")


@pytest.fixture
def loaded(store: RecordsStore) -> RecordsStore:
    manifest = RecordsManifest.load(SAMPLES)
    for source in manifest.sources:
        if source.record_type == "aggregate_statistic":
            ingest_aggregates(source, store, data_dir=SAMPLES.parent)
        else:
            ingest_source(source, store, data_dir=SAMPLES.parent, taken_at=WHEN)
    return store


@pytest.fixture
def service(loaded: RecordsStore) -> RecordsService:
    return RecordsService(loaded, SAMPLES)


# -- the separation, asserted structurally -----------------------------------


def test_the_records_schema_has_no_embedding_anywhere() -> None:
    """Records are never embedded. The absence is the design."""
    lowered = SCHEMA.lower()
    for word in ("embedding", "vector", "faiss", "chroma"):
        assert word not in lowered


def test_the_records_database_is_its_own_file(tmp_path) -> None:
    from app.core.settings import Settings

    settings = Settings(data_dir=tmp_path)
    assert settings.records_db_path != settings.index_dir
    assert settings.index_dir not in settings.records_db_path.parents


def test_the_context_builder_cannot_be_given_a_record() -> None:
    """Rule 1, held by a type rather than by a policy."""
    import inspect

    from app.services.context import build_context

    signature = inspect.signature(build_context)
    annotation = signature.parameters["passages"].annotation
    assert "ScoredChunk" in str(annotation)
    assert "Record" not in str(annotation).replace("ScoredChunk", "")


def test_the_confidence_rule_cannot_be_given_a_record() -> None:
    """Rule 2. There is no parameter through which one could arrive."""
    from app.services.confidence import RetrievalEvidence

    assert "record" not in " ".join(RetrievalEvidence.__dataclass_fields__).lower()


def test_the_evidence_label_says_what_a_record_is() -> None:
    """Rule 1's other half: if record text ever reaches a model, this wraps it."""
    assert "not a statement of law" in EVIDENCE_LABEL
    assert "EVIDENCE" in EVIDENCE_LABEL


def test_a_record_can_never_be_marked_citable() -> None:
    from app.models.domain import Record

    annotation = Record.model_fields["citable_in_answers"].annotation
    assert str(annotation) == "typing.Literal[False]"


# -- portals: no fetcher, anywhere -------------------------------------------


def test_a_portal_is_refused_even_when_a_fetch_would_work(store: RecordsStore) -> None:
    """The refusal is on access_mode, not on whether the file is readable."""
    manifest = RecordsManifest.load(SAMPLES)
    portal = manifest.by_id("sample-registry-portal")
    assert portal is not None
    assert portal.access_mode is RecordAccessMode.PORTAL_LINK_ONLY
    assert portal.licence, "the fixture carries a licence on purpose"
    assert (SAMPLES.parent / str(portal.source_url)).exists(), "and a readable file"

    outcome = ingest_source(portal, store, data_dir=SAMPLES.parent, taken_at=WHEN)
    assert outcome.outcome == "skipped"
    assert "never runs the search" in outcome.reason
    assert store.count() == 0


def test_a_portal_may_not_carry_a_parser_or_a_field_map(tmp_path) -> None:
    raw = json.loads(SAMPLES.read_text(encoding="utf-8"))
    for row in raw["sources"]:
        if row["access_mode"] == "portal_link_only":
            row["parser"] = "csv"
    path = tmp_path / "bad.json"
    path.write_text(json.dumps(raw), encoding="utf-8")
    with pytest.raises(ValueError, match="nothing here for a fetcher"):
        RecordsManifest.load(path)


def test_the_portal_module_contains_no_http_client() -> None:
    source = (REPO_ROOT / "backend" / "app" / "records" / "portal.py").read_text(encoding="utf-8")
    for marker in ("urlopen", "requests.", "httpx", "urlretrieve", "aiohttp"):
        assert marker not in source


def test_every_real_portal_has_no_verified_link_template() -> None:
    """A deep link written from memory looks like a search that found nothing."""
    manifest = RecordsManifest.load(REAL)
    portals = manifest.portals()
    assert portals
    for portal in portals:
        assert portal.link_template is None
        assert build_link(portal, {"query": "anything"}) is None


def test_a_verified_template_is_filled_and_encoded() -> None:
    manifest = RecordsManifest.load(SAMPLES)
    portal = manifest.by_id("sample-registry-portal")
    assert portal is not None
    url = build_link(portal, {"query": "joint discomfort"})
    assert url == "https://registry.sampleland.invalid/search?q=joint%20discomfort"


def test_a_template_with_no_value_supplied_yields_no_link() -> None:
    manifest = RecordsManifest.load(SAMPLES)
    portal = manifest.by_id("sample-registry-portal")
    assert portal is not None
    assert build_link(portal, {}) is None


def test_a_template_naming_an_unknown_placeholder_is_an_error() -> None:
    from dataclasses import replace

    manifest = RecordsManifest.load(SAMPLES)
    portal = manifest.by_id("sample-registry-portal")
    assert portal is not None
    broken = replace(portal, link_template="https://x.invalid/?a={nonsense}")
    with pytest.raises(ValueError, match="unknown placeholders"):
        build_link(broken, {"nonsense": "x"})


def test_a_portal_with_no_template_is_still_listed() -> None:
    """A reader deciding where else to look is served by knowing it exists."""
    manifest = RecordsManifest.load(REAL)
    links = links_for(manifest.sources)
    assert len(links) == len(manifest.portals())
    assert all(link.url is None for link in links)
    assert all(link.not_searched_here for link in links)


def test_placeholders_are_read_off_a_template() -> None:
    assert template_placeholders("https://x/?q={query}&a={applicant}") == {"query", "applicant"}


# -- ingestion gates ---------------------------------------------------------


def test_a_source_with_no_licence_is_not_ingested(store: RecordsStore) -> None:
    from dataclasses import replace

    source = RecordsManifest.load(SAMPLES).by_id("sample-registry-applications")
    assert source is not None
    outcome = ingest_source(
        replace(source, licence=None), store, data_dir=SAMPLES.parent, taken_at=WHEN
    )
    assert outcome.outcome == "skipped"
    assert "no licence has been read" in outcome.reason


def test_schema_drift_fails_the_run(store: RecordsStore) -> None:
    from dataclasses import replace

    source = RecordsManifest.load(SAMPLES).by_id("sample-registry-applications")
    assert source is not None
    drifted = replace(source, field_map={**source.field_map, "title": "headline_that_is_not_there"})
    outcome = ingest_source(drifted, store, data_dir=SAMPLES.parent, taken_at=WHEN)
    assert outcome.outcome == "failed"
    assert "schema drift" in outcome.reason
    assert store.count() == 0


def test_a_mapped_field_mostly_null_fails_the_run(tmp_path, store: RecordsStore) -> None:
    """A mapping that silently produces nulls is worse than one that crashes."""
    from dataclasses import replace

    source = RecordsManifest.load(SAMPLES).by_id("sample-registry-applications")
    assert source is not None

    rows = (SAMPLES.parent / "sample-registry-records.csv").read_text(encoding="utf-8").splitlines()
    header = rows[0] + ",mostly_empty"
    body = [row + ("," if index else ",filled") for index, row in enumerate(rows[1:])]
    path = tmp_path / "nulls.csv"
    path.write_text("\n".join([header, *body]), encoding="utf-8")

    nulled = replace(
        source,
        source_url=path.name,
        field_map={**source.field_map, "goods_or_field": "mostly_empty"},
    )
    outcome = ingest_source(nulled, store, data_dir=tmp_path, taken_at=WHEN)
    assert outcome.outcome == "failed"
    assert "more than " + str(round(MAX_NULL_SHARE * 100)) + "%" in outcome.reason


def test_check_schema_names_the_missing_columns() -> None:
    rows = [{"a": "1", "b": "2"}]
    assert check_schema(rows, {"record_id": "a", "title": "missing"}) == ["missing"]
    assert check_schema(rows, {"record_id": "a", "title": "b"}) == []


def test_read_rows_refuses_a_parser_it_does_not_know(tmp_path) -> None:
    path = tmp_path / "x.txt"
    path.write_text("anything", encoding="utf-8")
    with pytest.raises(ValueError, match="unknown records parser"):
        read_rows(path, "telepathy")


def test_a_row_with_no_id_or_title_is_dropped_rather_than_stored() -> None:
    source = RecordsManifest.load(SAMPLES).by_id("sample-registry-applications")
    assert source is not None
    rows = [
        {"application_number": "", "invention_title": "No id"},
        {"application_number": "X-1", "invention_title": ""},
        {"application_number": "X-2", "invention_title": "Kept"},
    ]
    mapped, _shares = map_rows(rows, source, taken_at=WHEN)
    assert [item.record.title for item in mapped] == ["Kept"]


# -- snapshots ---------------------------------------------------------------


def test_a_run_writes_a_snapshot(loaded: RecordsStore) -> None:
    snapshots = loaded.snapshots("sample-registry-applications")
    assert len(snapshots) == 1
    assert snapshots[0].rows_added == 8
    assert snapshots[0].rows_total == 8


def test_a_second_run_over_an_unchanged_file_reports_no_change(loaded: RecordsStore) -> None:
    source = RecordsManifest.load(SAMPLES).by_id("sample-registry-applications")
    assert source is not None
    outcome = ingest_source(source, loaded, data_dir=SAMPLES.parent, taken_at=WHEN)
    assert outcome.ok
    assert outcome.rows_added == 0
    assert outcome.rows_changed == 0
    assert loaded.count() == 8


def test_snapshots_are_append_only(loaded: RecordsStore) -> None:
    """There is no update path on the store, and re-running appends."""
    assert not hasattr(loaded, "update_snapshot")
    source = RecordsManifest.load(SAMPLES).by_id("sample-registry-applications")
    assert source is not None
    ingest_source(source, loaded, data_dir=SAMPLES.parent, taken_at=WHEN)
    assert len(loaded.snapshots("sample-registry-applications")) == 2


def test_a_changed_row_is_counted_as_changed(tmp_path, loaded: RecordsStore) -> None:
    from dataclasses import replace

    source = RecordsManifest.load(SAMPLES).by_id("sample-registry-applications")
    assert source is not None
    original = (SAMPLES.parent / "sample-registry-records.csv").read_text(encoding="utf-8")
    path = tmp_path / "changed.csv"
    path.write_text(original.replace("Under examination", "Granted", 1), encoding="utf-8")

    outcome = ingest_source(
        replace(source, source_url=path.name), loaded, data_dir=tmp_path, taken_at=WHEN
    )
    assert outcome.rows_changed == 1
    assert outcome.rows_added == 0


def test_a_row_that_disappears_is_removed(tmp_path, loaded: RecordsStore) -> None:
    from dataclasses import replace

    source = RecordsManifest.load(SAMPLES).by_id("sample-registry-applications")
    assert source is not None
    lines = (
        (SAMPLES.parent / "sample-registry-records.csv").read_text(encoding="utf-8").splitlines()
    )
    path = tmp_path / "fewer.csv"
    path.write_text("\n".join(lines[:-1]), encoding="utf-8")

    outcome = ingest_source(
        replace(source, source_url=path.name), loaded, data_dir=tmp_path, taken_at=WHEN
    )
    assert outcome.rows_removed == 1
    assert loaded.count() == 7


def test_a_snapshot_row_can_be_written_and_read(store: RecordsStore) -> None:
    store.record_snapshot(
        Snapshot(snapshot_id="s1", source_id="src", taken_at=WHEN, rows_total=3, note="a note")
    )
    read = store.snapshots("src")
    assert [s.snapshot_id for s in read] == ["s1"]
    assert read[0].note == "a note"


# -- searching ---------------------------------------------------------------


def test_full_text_search_finds_a_record_by_its_title(service: RecordsService) -> None:
    found = service.search_records("polyherbal formulation")
    assert [record.title for record in found] == [
        "Polyherbal formulation and method of standardising the same"
    ]


def test_search_matches_on_the_abstract_and_the_applicant(service: RecordsService) -> None:
    assert service.search_records("Sampleland Machinery Works")
    assert service.search_records("apparatus")


def test_search_syntax_a_reader_types_is_not_an_operator(service: RecordsService) -> None:
    """FTS5 syntax typed into the box is text, not an operator and not an error."""
    # `NEAR` and the quotes are searched for, so this finds the one record whose
    # title has both words rather than raising or running a proximity query.
    assert len(service.search_records('"polyherbal" NEAR formulation')) <= 1
    # Punctuation alone leaves no tokens, which is the same as an empty query:
    # it browses rather than acting as a wildcard.
    assert len(service.search_records("*")) == len(service.search_records(""))
    assert service.search_records("nothing-matches-this-phrase-at-all") == []


def test_search_filters_narrow_rather_than_widen(service: RecordsService) -> None:
    everything = service.search_records("", limit=100)
    granted = service.search_records("", status="Granted", limit=100)
    assert 0 < len(granted) < len(everything)
    assert all(record.status == "Granted" for record in granted)


def test_search_can_be_bounded_by_filing_date(service: RecordsService) -> None:
    recent = service.search_records("", filed_from=date(2023, 1, 1), limit=100)
    assert recent
    assert all(
        record.filing_date is not None and record.filing_date >= date(2023, 1, 1)
        for record in recent
    )


def test_a_record_reads_back_with_everything_it_was_given(service: RecordsService) -> None:
    found = service.search_records("polyherbal formulation")[0]
    again = service.get_record(found.record_id)
    assert again is not None
    assert again.title == found.title
    assert again.applicant == found.applicant
    assert again.filing_date == found.filing_date
    assert again.citable_in_answers is False


def test_an_unknown_record_is_absent_rather_than_invented(service: RecordsService) -> None:
    assert service.get_record("no-such-record") is None


def test_searching_an_empty_store_returns_nothing(store: RecordsStore) -> None:
    service = RecordsService(store, SAMPLES)
    assert service.search_records("anything") == []
    assert service.related_records("our herbal formulation patent", "IN") == ()


# -- aggregates --------------------------------------------------------------


def test_aggregates_load_into_their_own_table(service: RecordsService) -> None:
    rows = service.landscape()
    assert len(rows) == 8
    assert {row.dimension for row in rows} == {"compositions", "processes"}
    assert all(row.citable_in_answers is False for row in rows)


def test_an_aggregate_is_not_reachable_from_the_answer_path() -> None:
    """Rule 4. Nothing in the query pipeline calls landscape."""
    pipeline = (REPO_ROOT / "backend" / "app" / "services" / "pipeline.py").read_text(
        encoding="utf-8"
    )
    assert "landscape" not in pipeline
    assert "aggregate" not in pipeline.lower()


def test_aggregates_can_be_filtered_by_dimension(service: RecordsService) -> None:
    rows = service.landscape("compositions")
    assert rows
    assert all(row.dimension == "compositions" for row in rows)


def test_an_aggregate_row_carries_no_record_identity() -> None:
    """It describes an industry, so it has nowhere to put a product."""
    fields = set(AggregateStatistic.__dataclass_fields__)
    assert "record_id" not in fields
    assert "title" not in fields
    assert "applicant" not in fields


# -- what the answer surface gets --------------------------------------------


def test_records_are_offered_only_where_the_question_is_about_filings(
    service: RecordsService,
) -> None:
    assert service.related_records("is our herbal formulation patentable?", "IN")
    assert service.related_records("what prior art exists for a composition?", "IN")
    assert service.related_records("what goes on the label?", "IN") == ()


def test_offering_records_matches_any_word_not_every_word(service: RecordsService) -> None:
    """No filing's title contains every word of somebody's question."""
    assert service.related_records("is our herbal formulation patentable?", "IN")
    assert service.search_records("is our herbal formulation patentable") == []


def test_the_source_list_reports_what_was_ingested(service: RecordsService) -> None:
    rows = {row["source_id"]: row for row in service.sources()}
    assert rows["sample-registry-applications"]["ingested"] is True
    assert rows["sample-registry-applications"]["record_count"] == 8
    assert rows["sample-registry-portal"]["record_count"] == 0
    assert all(row["citable_in_answers"] is False for row in rows.values())


def test_every_source_carries_its_attribution_verbatim(service: RecordsService) -> None:
    """Open data licences typically require exactly this."""
    rows = {row["source_id"]: row for row in service.sources()}
    attribution = rows["sample-registry-applications"]["attribution_text"]
    assert attribution
    assert "endorses nothing" in attribution


def test_the_real_manifest_ingests_nothing_and_says_why(store: RecordsStore) -> None:
    manifest = RecordsManifest.load(REAL)
    reasons = []
    for source in manifest.sources:
        outcome = ingest_source(source, store, data_dir=REAL.parent, taken_at=WHEN)
        assert outcome.outcome == "skipped", source.source_id
        reasons.append(outcome.reason)
    assert store.count() == 0
    assert any("never runs the search" in reason for reason in reasons)
    assert any("no licence has been read" in reason for reason in reasons)
