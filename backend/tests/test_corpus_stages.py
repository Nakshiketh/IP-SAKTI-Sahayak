"""Parsing, segmenting, enriching, versioning and validating — each on its own.

The segmenter tests are the ones that matter most. Every assertion about a
section path is an assertion about what a citation will say, and a citation that
is wrong about where text came from is the failure this product exists to avoid.
"""

from __future__ import annotations

from datetime import date

import pytest

from app.corpus.enrich import LLMTagger, RuleTagger, enrich
from app.corpus.parse import HtmlParser, OcrParser, PdfLayoutParser, TextParser, get_parser
from app.corpus.segment import (
    PREAMBLE,
    TARGET_MAX_TOKENS,
    get_profile,
    segment,
)
from app.corpus.types import AccessMode, Block, DocumentEntry, ParsedDocument, SegmentedChunk
from app.corpus.validate import unsafe_chunk_ids, validate_chunks, validate_entry
from app.corpus.version import apply_versions, bump, diff_document, write_changelog

STATUTE = """\
An illustrative Act, with a long title before anything numbered.

CHAPTER I  PRELIMINARY

1. Short title.

(1) This may be called the fixture.

2. Definitions.

(a) "thing" means a thing;

(b) "other thing" means another thing.

CHAPTER II  SUBSTANCE

3. What must be done.

(1) A person shall do the thing.
"""

TREATY = """\
A preamble.

PART I  GENERAL

Article 1  Scope

1. This applies between the parties.

Article 2  Terms

1. Terms mean what they say.
"""


def entry(**kwargs) -> DocumentEntry:
    base = {
        "document_id": "fixture-doc",
        "title": "A fixture document",
        "organization": "A fixture body",
        "jurisdiction": "IN",
        "regime_family": "patents",
        "document_type": "act",
        "parser": "text",
        "chunking_profile": "statute_section_aware",
        "source_url": "corpus/samples/x.txt",
        "effective_from": date(2020, 1, 1),
        "checksum": "sha256:abc",
        "verification_status": "demo",
    }
    base.update(kwargs)
    return DocumentEntry(**base)


def parsed(text: str, document_id: str = "fixture-doc") -> ParsedDocument:
    blocks = [
        Block(text=" ".join(part.split()), page=1) for part in text.split("\n\n") if part.strip()
    ]
    return ParsedDocument(document_id=document_id, blocks=tuple(blocks), parser="text")


# -- parsing -----------------------------------------------------------------


def test_the_text_parser_keeps_pages(tmp_path) -> None:
    path = tmp_path / "doc.txt"
    path.write_text("Page one text.\n\n\x0cPage two text.", encoding="utf-8")
    document = TextParser().parse(path, "d")
    assert [(block.text, block.page) for block in document.blocks] == [
        ("Page one text.", 1),
        ("Page two text.", 2),
    ]
    assert document.page_count == 2


def test_the_html_parser_drops_what_is_not_document_text(tmp_path) -> None:
    path = tmp_path / "doc.html"
    path.write_text(
        "<html><head><style>p{color:red}</style>"
        "<script>var secret = 1;</script></head><body>"
        "<nav>Home Index</nav><h2>A heading</h2><p>Body text.</p>"
        "<footer>Footer text.</footer></body></html>",
        encoding="utf-8",
    )
    document = HtmlParser().parse(path, "d")
    texts = [block.text for block in document.blocks]
    assert "Body text." in texts
    assert not any("secret" in text or "color:red" in text for text in texts)
    assert not any("Home Index" in text or "Footer text." in text for text in texts)


def test_the_html_parser_marks_headings(tmp_path) -> None:
    path = tmp_path / "doc.html"
    path.write_text("<body><h3>1. A rule.</h3><p>Its body.</p></body>", encoding="utf-8")
    blocks = HtmlParser().parse(path, "d").blocks
    assert blocks[0].is_heading is True
    assert blocks[1].is_heading is False


def test_html_has_no_pages_and_says_so(tmp_path) -> None:
    path = tmp_path / "doc.html"
    path.write_text("<body><p>Text.</p></body>", encoding="utf-8")
    assert all(block.page is None for block in HtmlParser().parse(path, "d").blocks)


def test_the_optional_parsers_report_absence_rather_than_failing() -> None:
    for parser in (PdfLayoutParser(), OcrParser()):
        assert isinstance(parser.available, bool)
    assert TextParser().available is True
    assert HtmlParser().available is True


def test_an_unknown_parser_is_a_build_error() -> None:
    with pytest.raises(KeyError):
        get_parser("no-such-parser")


# -- segmenting --------------------------------------------------------------


def test_a_statute_is_split_at_its_own_sections() -> None:
    chunks = segment(parsed(STATUTE), get_profile("statute_section_aware"))
    paths = [" › ".join(chunk.section_path) for chunk in chunks]
    assert paths == [
        PREAMBLE,
        "CHAPTER I › Section 1",
        "CHAPTER I › Section 2",
        "CHAPTER II › Section 3",
    ]


def test_a_section_heading_becomes_the_chunk_heading_not_its_body() -> None:
    chunks = segment(parsed(STATUTE), get_profile("statute_section_aware"))
    section_two = next(chunk for chunk in chunks if chunk.section_path[-1] == "Section 2")
    assert section_two.heading == "Definitions."
    assert not section_two.text.startswith("Definitions.")
    assert '"thing" means a thing' in section_two.text


def test_a_short_section_is_never_merged_into_its_neighbour() -> None:
    """Merging would put one section's words inside another's citation."""
    chunks = segment(parsed(STATUTE), get_profile("statute_section_aware"))
    section_one = next(chunk for chunk in chunks if chunk.section_path[-1] == "Section 1")
    assert "Definitions" not in section_one.text
    assert "thing" not in section_one.text


def test_text_before_the_first_section_is_the_preamble_not_an_empty_path() -> None:
    chunks = segment(parsed(STATUTE), get_profile("statute_section_aware"))
    assert chunks[0].section_path == (PREAMBLE,)
    assert "long title" in chunks[0].text


def test_a_treaty_is_split_at_its_articles() -> None:
    chunks = segment(parsed(TREATY), get_profile("treaty_article_aware"))
    paths = [" › ".join(chunk.section_path) for chunk in chunks]
    assert paths == [PREAMBLE, "PART I › Article 1", "PART I › Article 2"]


def test_a_sub_clause_marker_is_kept_in_the_text_it_labels() -> None:
    chunks = segment(parsed(STATUTE), get_profile("statute_section_aware"))
    section_two = next(chunk for chunk in chunks if chunk.section_path[-1] == "Section 2")
    assert "(a)" in section_two.text and "(b)" in section_two.text


def test_a_long_section_splits_at_its_own_boundaries_keeping_the_parent_path() -> None:
    body = " ".join(["word"] * 400)
    long_statute = (
        "CHAPTER I  ONE\n\n"
        "1. A long section.\n\n"
        "(1) " + body + "\n\n"
        "(2) " + body + "\n\n"
        "(3) " + body + "\n"
    )
    chunks = segment(parsed(long_statute), get_profile("statute_section_aware"))
    parts = [chunk for chunk in chunks if chunk.section_path[-1] == "Section 1"]
    assert len(parts) > 1
    for part in parts:
        assert part.section_path == ("CHAPTER I", "Section 1")
        assert part.token_count <= TARGET_MAX_TOKENS * 1.4


def test_overlap_never_crosses_a_section_boundary() -> None:
    statute = (
        "CHAPTER I  ONE\n\n"
        "1. First.\n\n"
        "(1) " + " ".join(["alpha"] * 600) + "\n\n"
        "2. Second.\n\n"
        "(1) " + " ".join(["beta"] * 60) + "\n"
    )
    chunks = segment(parsed(statute), get_profile("statute_section_aware"))
    second = next(chunk for chunk in chunks if chunk.section_path[-1] == "Section 2")
    assert "alpha" not in second.text
    for chunk in chunks:
        if chunk.section_path[-1] == "Section 1":
            assert "beta" not in chunk.text


def test_identical_wording_produces_an_identical_chunk_id() -> None:
    first = segment(parsed(STATUTE), get_profile("statute_section_aware"))
    second = segment(parsed(STATUTE), get_profile("statute_section_aware"))
    assert [chunk.chunk_id for chunk in first] == [chunk.chunk_id for chunk in second]


def test_changed_wording_produces_a_different_chunk_id_for_the_same_section() -> None:
    amended = STATUTE.replace("A person shall do the thing.", "A person shall not do the thing.")
    before = segment(parsed(STATUTE), get_profile("statute_section_aware"))
    after = segment(parsed(amended), get_profile("statute_section_aware"))
    old = next(c for c in before if c.section_path[-1] == "Section 3")
    new = next(c for c in after if c.section_path[-1] == "Section 3")
    assert old.section_key == new.section_key
    assert old.chunk_id != new.chunk_id


def test_a_chunk_id_survives_being_used_as_a_dom_id() -> None:
    chunks = segment(parsed(STATUTE), get_profile("statute_section_aware"))
    assert unsafe_chunk_ids(chunks) == []


def test_an_unknown_profile_is_a_build_error() -> None:
    with pytest.raises(KeyError):
        get_profile("no-such-profile")


# -- enriching ---------------------------------------------------------------


def test_a_chunk_carries_its_document_tags_as_a_floor() -> None:
    document = entry(regulatory_areas=("licensing",), ip_rights=("patent",))
    chunks = segment(parsed(STATUTE), get_profile("statute_section_aware"))
    tagged, _proposals = enrich(chunks, document)
    assert all("licensing" in chunk.regulatory_areas for chunk in tagged)
    assert all("patent" in chunk.ip_rights for chunk in tagged)


def test_a_chunk_is_tagged_from_the_same_lexicon_the_question_is_read_with() -> None:
    document = entry()
    chunk = SegmentedChunk(
        chunk_id="c",
        document_id="d",
        text="Every article shall bear a label containing the following particulars.",
        section_path=("Section 7",),
        heading="Labelling",
        page_from=1,
        page_to=1,
        token_count=12,
    )
    tagged = RuleTagger().tag(chunk, document)
    assert "labelling" in tagged.regulatory_areas


def test_topics_are_words_that_are_actually_in_the_passage() -> None:
    chunks = segment(parsed(STATUTE), get_profile("statute_section_aware"))
    tagged, _proposals = enrich(chunks, entry())
    for chunk in tagged:
        haystack = (chunk.text + " " + (chunk.heading or "") + " ".join(chunk.section_path)).lower()
        for topic in chunk.topics:
            assert topic[:5] in haystack


def test_a_chunk_inherits_the_document_effective_window() -> None:
    tagged, _proposals = enrich(
        segment(parsed(STATUTE), get_profile("statute_section_aware")),
        entry(effective_from=date(2021, 5, 1)),
    )
    assert all(chunk.effective_from == date(2021, 5, 1) for chunk in tagged)


def test_the_model_tagger_never_enters_the_index(tmp_path) -> None:
    """A model's guess about which area a provision belongs to is a claim about law."""
    reviewer = LLMTagger(tmp_path / "tags-review.jsonl")
    assert reviewer.enters_index is False
    assert RuleTagger().enters_index is True

    chunks = segment(parsed(STATUTE), get_profile("statute_section_aware"))
    tagged, proposals = enrich(chunks, entry(), review=reviewer)
    assert len(proposals) == len(tagged)
    assert all(row["proposed_tags"] is None and row["reviewed"] is False for row in proposals)


# -- versioning --------------------------------------------------------------


def payloads(chunks: list[SegmentedChunk], document_id: str = "fixture-doc") -> dict[str, dict]:
    return {
        chunk.chunk_id: {
            "chunk_id": chunk.chunk_id,
            "section_key": chunk.section_key,
            "document_id": document_id,
            "text": chunk.text,
            "section_path": list(chunk.section_path),
            "heading": chunk.heading,
            "page_from": chunk.page_from,
            "page_to": chunk.page_to,
            "token_count": chunk.token_count,
            "effective_from": None,
            "effective_to": None,
        }
        for chunk in chunks
    }


def test_an_unamended_document_keeps_every_chunk_id() -> None:
    chunks = segment(parsed(STATUTE), get_profile("statute_section_aware"))
    carried, diff = diff_document(entry(), chunks, payloads(chunks), closed_on=date(2026, 1, 1))
    assert diff.unchanged == len(chunks)
    assert diff.changed == [] and diff.added == [] and diff.removed == []
    assert carried == []


def test_amended_wording_is_retained_and_closed_rather_than_replaced() -> None:
    before = segment(parsed(STATUTE), get_profile("statute_section_aware"))
    amended = STATUTE.replace("A person shall do the thing.", "A person shall not do the thing.")
    after = segment(parsed(amended), get_profile("statute_section_aware"))

    carried, diff = diff_document(entry(), after, payloads(before), closed_on=date(2026, 1, 1))
    assert diff.changed == ["CHAPTER II › Section 3"]
    assert len(carried) == 1
    assert carried[0].effective_to == date(2026, 1, 1)
    assert "shall do the thing" in carried[0].text


def test_a_section_that_goes_away_is_retained_and_closed() -> None:
    before = segment(parsed(STATUTE), get_profile("statute_section_aware"))
    without = STATUTE.replace(
        "3. What must be done.\n\n(1) A person shall do the thing.\n", "3. Repealed.\n\nNothing.\n"
    )
    after = segment(parsed(without), get_profile("statute_section_aware"))
    carried, diff = diff_document(entry(), after, payloads(before), closed_on=date(2026, 1, 1))
    assert all(chunk.effective_to == date(2026, 1, 1) for chunk in carried)
    assert diff.changed or diff.removed


def test_a_document_that_was_not_re_ingested_is_carried_forward_open() -> None:
    """A partial run must not retire the rest of the corpus."""
    other = segment(parsed(STATUTE), get_profile("statute_section_aware"))
    previous = payloads(other, document_id="a-different-document")
    result = apply_versions([], previous, closed_on=date(2026, 1, 1))
    assert len(result.chunks) == len(other)
    assert all(chunk.effective_to is None for chunk in result.chunks)


def test_the_version_bumps_minor_when_something_moved_and_patch_when_not() -> None:
    assert bump("0.3.4", moved=True) == "0.4.0"
    assert bump("0.3.4", moved=False) == "0.3.5"
    assert bump("0.0.0-unbuilt", moved=True) == "0.1.0"


def test_the_changelog_is_written_for_a_person(tmp_path) -> None:
    before = segment(parsed(STATUTE), get_profile("statute_section_aware"))
    amended = STATUTE.replace("A person shall do the thing.", "A person shall not do the thing.")
    after = segment(parsed(amended), get_profile("statute_section_aware"))
    _carried, diff = diff_document(entry(), after, payloads(before), closed_on=date(2026, 1, 1))

    path = tmp_path / "CHANGELOG.md"
    write_changelog(
        path,
        corpus_version="0.2.0",
        diffs=[diff],
        on=date(2026, 1, 1),
        titles={"fixture-doc": "A Fixture Act, 2020"},
    )
    text = path.read_text(encoding="utf-8")
    assert "## 0.2.0 — 2026-01-01" in text
    assert "A Fixture Act, 2020" in text
    assert "CHAPTER II › Section 3" in text
    assert "retained and closed" in text


def test_the_changelog_puts_the_newest_entry_first(tmp_path) -> None:
    path = tmp_path / "CHANGELOG.md"
    write_changelog(path, corpus_version="0.1.0", diffs=[], on=date(2026, 1, 1))
    write_changelog(path, corpus_version="0.2.0", diffs=[], on=date(2026, 2, 1))
    text = path.read_text(encoding="utf-8")
    assert text.index("0.2.0") < text.index("0.1.0")


# -- validating --------------------------------------------------------------


def test_a_document_with_no_effective_date_does_not_enter_the_index() -> None:
    problems = validate_entry(entry(effective_from=None))
    assert any("effective_from" in problem.reason for problem in problems)


def test_a_document_with_no_checksum_does_not_enter_the_index() -> None:
    assert any("checksum" in problem.reason for problem in validate_entry(entry(checksum=None)))


def test_a_document_with_no_source_url_does_not_enter_the_index() -> None:
    assert any("source_url" in problem.reason for problem in validate_entry(entry(source_url=None)))


def test_an_unset_verification_status_does_not_enter_the_index() -> None:
    problems = validate_entry(entry(verification_status="probably fine"))
    assert any("verification_status" in problem.reason for problem in problems)


def test_a_valid_entry_passes_every_gate() -> None:
    assert validate_entry(entry()) == []


def test_a_chunk_with_no_section_path_does_not_enter_the_index() -> None:
    chunk = SegmentedChunk(
        chunk_id="c",
        document_id="d",
        text="Some text.",
        section_path=(),
        heading=None,
        page_from=1,
        page_to=1,
        token_count=3,
    )
    problems = validate_chunks(entry(), [chunk])
    assert any("section_path" in problem.reason for problem in problems)


def test_a_document_the_profile_found_no_structure_in_is_rejected() -> None:
    """Every citation would say Preamble, which is wrong about where it came from."""
    prose = "\n\n".join("A paragraph of unstructured prose number " + str(n) for n in range(6))
    chunks = segment(parsed(prose), get_profile("statute_section_aware"))
    problems = validate_chunks(entry(), chunks)
    assert any("recognised almost no structure" in problem.reason for problem in problems)


def test_a_document_that_parsed_to_nothing_is_rejected() -> None:
    assert any("zero chunks" in problem.reason for problem in validate_chunks(entry(), []))


def test_a_credentialed_source_is_not_fetchable_whatever_its_url_says() -> None:
    credentialed = entry(
        access_mode=AccessMode.USER_CREDENTIALED, source_url="https://example.invalid/doc"
    )
    assert credentialed.fetchable is False
    assert entry(access_mode=AccessMode.PORTAL_LINK_ONLY).fetchable is False
    assert entry().fetchable is True
