"""The contract test: the checked-in schema must match the Pydantic model.

The frontend derives its types from ``schemas/domain.schema.json``. If this test
fails, the Python side moved and the checked-in schema is stale — regenerate it
with ``python scripts/gen_schema.py`` and the frontend test will then tell you
whether the TypeScript side needs updating too.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest
from pydantic import ValidationError

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT / "scripts"))

from gen_schema import SCHEMA_PATH, build_schema, render  # noqa: E402

from app.models.domain import CONTRACT_ENUMS, CONTRACT_MODELS  # noqa: E402


def test_checked_in_schema_is_current() -> None:
    assert SCHEMA_PATH.exists(), "run: python scripts/gen_schema.py"
    on_disk = SCHEMA_PATH.read_text(encoding="utf-8")
    assert on_disk == render(build_schema()), (
        "schemas/domain.schema.json is stale. Run: python scripts/gen_schema.py"
    )


def test_schema_covers_every_contract_type() -> None:
    defs = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))["$defs"]
    for cls in (*CONTRACT_ENUMS, *CONTRACT_MODELS):
        assert cls.__name__ in defs, f"{cls.__name__} missing from the generated schema"


@pytest.mark.parametrize("enum_cls", CONTRACT_ENUMS, ids=lambda c: c.__name__)
def test_enum_values_are_stable_strings(enum_cls: type) -> None:
    """Enum values cross the wire as strings; a non-string would break the TS union."""
    for member in enum_cls:
        assert isinstance(member.value, str)


def test_record_is_never_citable() -> None:
    """Registry data is evidence, never authority. Pinned at the schema level."""
    from app.models.domain import Jurisdiction, Record, RecordType

    record = Record(
        record_id="r1",
        source_id="s1",
        jurisdiction=Jurisdiction.IN,
        record_type=RecordType.PATENT_APPLICATION,
        title="Some filed application",
    )
    assert record.citable_in_answers is False

    # Literal[False] — construction with True is a validation error, not a silent
    # override, so no ingestion path can promote a record into a citation.
    with pytest.raises(ValidationError):
        Record(
            record_id="r2",
            source_id="s1",
            jurisdiction=Jurisdiction.IN,
            record_type=RecordType.PATENT_APPLICATION,
            title="Another",
            citable_in_answers=True,  # type: ignore[arg-type]
        )


def test_block_text_must_match_its_claims() -> None:
    """Citation is claim-level; the flat text cannot drift from the claims."""
    from app.models.domain import AnswerBlock, AnswerBlockKind, Claim

    block = AnswerBlock(
        id="b1",
        kind=AnswerBlockKind.ANSWER,
        text="First sentence. Second sentence.",
        citation_ids=["c1"],
        claims=[
            Claim(text="First sentence.", citation_ids=["c1"]),
            Claim(text="Second sentence.", citation_ids=[]),
        ],
    )
    assert len(block.claims) == 2
    # A claim with no citations is allowed, and renders as general explanation.
    assert block.claims[1].citation_ids == []

    with pytest.raises(ValidationError):
        AnswerBlock(
            id="b2",
            kind=AnswerBlockKind.ANSWER,
            text="Something else entirely.",
            claims=[Claim(text="First sentence.")],
        )

    with pytest.raises(ValidationError):
        AnswerBlock(
            id="b3",
            kind=AnswerBlockKind.ANSWER,
            text="First sentence.",
            citation_ids=[],
            claims=[Claim(text="First sentence.", citation_ids=["c1"])],
        )


def test_corpus_manifest_validates_against_the_document_model() -> None:
    """The manifest is what the interface resolves citations against.

    A malformed entry there surfaces as a broken citation on a reference page,
    which is the worst place to find it.
    """
    import json

    from app.models.domain import Document

    manifest_path = REPO_ROOT / "corpus" / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))

    documents = manifest["documents"]
    assert len(documents) > 0

    ids = [entry["document_id"] for entry in documents]
    assert len(ids) == len(set(ids)), "duplicate document ids in the manifest"

    for entry in documents:
        fields = {k: v for k, v in entry.items() if k in Document.model_fields}
        document = Document.model_validate(fields)

        # Nothing has been fetched, so nothing may claim to have been. These
        # fields are filled by the ingestion pipeline from the document itself.
        assert document.retrieved_at is None
        assert document.source_url is None
        assert document.effective_from is None
        assert document.verification_status.value == "unverified"


def test_records_manifest_is_evidential_only() -> None:
    """Layer 2 rules, checked where they can actually be enforced.

    Records are evidence of what was filed or granted. They are never authority,
    they are never fetched from an interactive portal, and a source whose licence
    nobody has read is not ingested.
    """
    import json

    manifest_path = REPO_ROOT / "corpus" / "records-manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    sources = manifest["sources"]
    assert len(sources) > 0

    ids = [entry["source_id"] for entry in sources]
    assert len(ids) == len(set(ids)), "duplicate source ids"

    for entry in sources:
        assert entry["citable_in_answers"] is False, entry["source_id"]
        # No licence has been read, so nothing may claim to have been ingested.
        assert entry["licence"] is None, entry["source_id"]
        assert entry["last_snapshot_at"] is None, entry["source_id"]
        assert entry["record_count"] is None, entry["source_id"]

        if entry["access_mode"] == "portal_link_only":
            # Nothing here for a fetcher to be written against.
            assert "parser" not in entry, entry["source_id"]
            assert "field_map" not in entry, entry["source_id"]
            assert entry.get("link_template") is None, entry["source_id"]


def test_no_fetcher_exists_for_a_portal_only_source() -> None:
    """The pre-demo checklist asks for this grep. Here it is, as a test.

    An interactive portal's terms generally forbid automated retrieval. The
    product links out and does not run the search, and the way to keep that true
    is for no code anywhere to name one of these sources next to a fetch.
    """
    import json
    import re

    manifest = json.loads(
        (REPO_ROOT / "corpus" / "records-manifest.json").read_text(encoding="utf-8")
    )
    portal_ids = [
        entry["source_id"]
        for entry in manifest["sources"]
        if entry["access_mode"] == "portal_link_only"
    ]
    assert portal_ids

    fetch_pattern = re.compile(
        r"\b(requests\.|httpx\.|urlopen|urlretrieve|aiohttp|fetch\(|curl\b|wget\b)"
    )

    searched = 0
    for path in (*(REPO_ROOT / "scripts").rglob("*.py"), *(REPO_ROOT / "backend" / "app").rglob("*.py")):
        text = path.read_text(encoding="utf-8")
        searched += 1
        for source_id in portal_ids:
            if source_id not in text:
                continue
            # A mention is fine; a mention in a file that fetches is not.
            assert not fetch_pattern.search(text), (
                f"{path.name} names portal-only source {source_id} and contains fetch code"
            )

    assert searched > 0, "found no Python files to check"
