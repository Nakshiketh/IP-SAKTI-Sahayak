"""Tokenising, BM25, fusion and reranking.

These are the parts with no opinions in them: given these passages and this
query, the numbers are what they are. Tested here rather than through the API so
a scoring regression names the scorer.
"""

from __future__ import annotations

from datetime import date

import pytest

from app.models.domain import Jurisdiction, VerificationStatus
from app.retrieval.bm25 import Bm25Index
from app.retrieval.channels import LexicalChannel, NullDenseChannel
from app.retrieval.fusion import reciprocal_rank_fusion
from app.retrieval.rerank import LexicalReranker
from app.retrieval.tokenize import fold, tokenize
from app.retrieval.types import IndexedChunk, RetrievalFilters, ScoredChunk
from app.services.retrieval import Retriever, find_contradictions


def chunk(chunk_id: str, text: str, **kwargs) -> IndexedChunk:
    defaults = {
        "document_id": kwargs.pop("document_id", chunk_id + "-doc"),
        "document_title": kwargs.pop("document_title", "A document"),
        "organization": kwargs.pop("organization", "An organization"),
        "jurisdiction": Jurisdiction.IN,
    }
    return IndexedChunk(chunk_id=chunk_id, text=text, **defaults, **kwargs)


class FixedStore:
    def __init__(self, chunks: list[IndexedChunk]) -> None:
        self._chunks = chunks

    available = True
    corpus_version = "test"
    is_demo = False

    def chunks(self) -> list[IndexedChunk]:
        return self._chunks

    def document_count(self) -> int:
        return len({c.document_id for c in self._chunks})


# -- tokenising --------------------------------------------------------------


@pytest.mark.parametrize(
    ("left", "right"),
    [
        ("manufacturing", "manufacture"),
        ("manufactures", "manufacture"),
        ("labelling", "label"),
        ("drugs", "drug"),
        ("licensing", "license"),
        ("studies", "study"),
        ("occurring", "occur"),
    ],
)
def test_inflections_meet_in_the_middle(left: str, right: str) -> None:
    assert fold(left) == fold(right)


def test_folding_leaves_indic_scripts_alone() -> None:
    for word in ("उत्पाद", "தயாரிப்பு", "ఉత్పత్తి", "উৎপাদন"):
        assert fold(word) == word


def test_tokenising_splits_every_script_the_corpus_uses() -> None:
    assert tokenize("Ayurvedic drug — औषधि, மருந்து") == [
        "ayurvedic",
        "drug",
        "औषधि",
        "மருந்து",
    ]


def test_stopwords_go_but_terms_of_art_stay() -> None:
    tokens = tokenize("What are the rules under the act?")
    assert "rul" in tokens and "act" in tokens
    assert "the" not in tokens and "what" not in tokens


# -- bm25 --------------------------------------------------------------------


def test_bm25_prefers_the_document_that_is_about_the_term() -> None:
    index = Bm25Index.build(
        [
            ("a", "manufacture of ayurvedic drugs, licence for manufacture"),
            ("b", "labelling of cosmetics"),
            ("c", "a licence is mentioned once here"),
        ]
    )
    ranked = index.search("licence to manufacture", limit=3)
    assert ranked[0][0] == "a"


def test_a_term_in_every_document_cannot_push_a_passage_down() -> None:
    """The floored idf, checked: no score may be negative."""
    index = Bm25Index.build([("a", "ayurvedic"), ("b", "ayurvedic"), ("c", "ayurvedic")])
    assert all(score >= 0 for _doc, score in index.search("ayurvedic", limit=3))


def test_a_query_matching_nothing_returns_nothing() -> None:
    index = Bm25Index.build([("a", "labelling of cosmetics")])
    assert index.search("brazil", limit=5) == []


# -- fusion ------------------------------------------------------------------


def test_fusion_prefers_what_both_channels_liked() -> None:
    fused = reciprocal_rank_fusion(
        {"lexical": ["x", "agreed", "y"], "dense": ["z", "agreed", "w"]}, k=60
    )
    assert fused[0][0] == "agreed"
    assert fused[0][2] == ("lexical", "dense")


def test_fusion_reads_rank_not_score() -> None:
    """Only the ordering is supplied, so only the ordering can matter."""
    first = reciprocal_rank_fusion({"lexical": ["a", "b"]})
    second = reciprocal_rank_fusion({"dense": ["a", "b"]})
    assert [row[1] for row in first] == [row[1] for row in second]


# -- reranking ---------------------------------------------------------------


def _scored(chunks: list[IndexedChunk]) -> list[ScoredChunk]:
    return [ScoredChunk(chunk=c, retrieval_score=0.5) for c in chunks]


def test_rerank_scores_stay_inside_the_range_the_thresholds_assume() -> None:
    candidates = _scored(
        [
            chunk("a", "licence to manufacture ayurvedic drugs", topics=("licence", "manufacture")),
            chunk("b", "labelling of cosmetics", topics=("label",)),
        ]
    )
    for result in LexicalReranker().rerank("licence to manufacture", candidates, keep=5):
        assert result.rerank_score is not None
        assert 0.0 <= result.rerank_score <= 1.0


def test_one_word_in_common_is_a_coincidence_not_a_match() -> None:
    """A single accidental overlap must not clear the retrieval floor."""
    candidates = _scored(
        [chunk("a", "food supplements: labelling and composition rules", topics=("label",))]
    )
    result = LexicalReranker().rerank("what are the patent rules in Brazil", candidates, keep=5)
    assert result[0].rerank_score is not None
    assert result[0].rerank_score < 0.35


def test_a_passage_covering_the_question_scores_strongly() -> None:
    candidates = _scored(
        [
            chunk(
                "a",
                "text",
                heading="Manufacture for sale of Ayurvedic drugs",
                topics=("licence", "manufacture", "premises", "ayurvedic", "need", "before"),
            ),
            chunk("b", "text", heading="Permitted claims", topics=("label", "claim")),
        ]
    )
    ranked = LexicalReranker().rerank(
        "what do we need in place before manufacturing an ayurvedic product", candidates, keep=5
    )
    assert ranked[0].chunk.chunk_id == "a"
    assert (ranked[0].rerank_score or 0) >= 0.55


def test_reranking_an_empty_candidate_set_returns_nothing() -> None:
    assert LexicalReranker().rerank("anything", [], keep=5) == []


# -- contradictions ----------------------------------------------------------


def test_a_declared_conflict_between_retrieved_passages_is_found() -> None:
    pair = _scored(
        [
            chunk("a", "one way", conflicts_with=("b",)),
            chunk("b", "another way", conflicts_with=("a",)),
        ]
    )
    assert find_contradictions(pair) == (("a", "b"),)


def test_a_conflict_with_a_passage_that_was_not_retrieved_is_not_a_conflict() -> None:
    only = _scored([chunk("a", "one way", conflicts_with=("b",))])
    assert find_contradictions(only) == ()


def test_supersession_between_retrieved_documents_is_a_contradiction() -> None:
    pair = _scored(
        [
            chunk("old", "text", document_id="d-old", superseded_by="d-new"),
            chunk("new", "text", document_id="d-new"),
        ]
    )
    assert find_contradictions(pair) == (("new", "old"),)


def test_contradictions_are_never_inferred_from_wording() -> None:
    """Two passages that read as opposites, with nothing declared, are not one."""
    pair = _scored(
        [
            chunk("a", "a licence is required"),
            chunk("b", "no licence is required"),
        ]
    )
    assert find_contradictions(pair) == ()


# -- the stage ---------------------------------------------------------------


def test_the_dense_channel_reports_itself_absent_rather_than_empty() -> None:
    assert NullDenseChannel().available is False
    assert LexicalChannel().available is True

    store = FixedStore([chunk("a", "licence to manufacture")])
    result = Retriever().retrieve(
        "licence", store, filters=RetrievalFilters(), candidates=10, keep=5, on=date(2026, 1, 1)
    )
    assert result.channels_used == ("lexical",)
    assert result.channels_unavailable == ("dense",)


def test_a_superseded_passage_is_retrieved_and_marked_not_dropped() -> None:
    """Finding only out-of-date sources is a different thing from finding none."""
    store = FixedStore(
        [
            chunk(
                "old",
                "licence to manufacture",
                effective_from=date(2015, 1, 1),
                effective_to=date(2019, 12, 31),
            )
        ]
    )
    result = Retriever().retrieve(
        "licence to manufacture",
        store,
        filters=RetrievalFilters(effective_on=date(2026, 1, 1)),
        candidates=10,
        keep=5,
        on=date(2026, 1, 1),
    )
    assert [p.chunk.chunk_id for p in result.passages] == ["old"]
    assert result.passages[0].chunk.within_effective_window(date(2026, 1, 1)) is False


def test_metadata_filters_run_before_scoring() -> None:
    store = FixedStore(
        [
            chunk("act", "licence to manufacture", document_type="act"),
            chunk("form", "licence to manufacture", document_type="form"),
        ]
    )
    result = Retriever().retrieve(
        "licence",
        store,
        filters=RetrievalFilters(document_types=frozenset({"act"})),
        candidates=10,
        keep=5,
        on=date(2026, 1, 1),
    )
    assert [p.chunk.chunk_id for p in result.passages] == ["act"]
    # The filtered passage never occupied a candidate slot.
    assert result.candidates_considered == 1


def test_a_verification_status_survives_retrieval() -> None:
    store = FixedStore([chunk("a", "licence", verification_status=VerificationStatus.DEMO)])
    result = Retriever().retrieve(
        "licence", store, filters=RetrievalFilters(), candidates=10, keep=5, on=date(2026, 1, 1)
    )
    assert result.passages[0].chunk.verification_status is VerificationStatus.DEMO
