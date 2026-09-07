"""The classification graph.

Structural properties, checked here rather than trusted: every outcome is
reachable, no path exceeds the eight questions the build document allows, there
are no cycles, and every class the graph can produce is a real ProductClass.
"""

from __future__ import annotations

import pytest

from app.models.domain import ProductClass
from app.services.classification import classify, load_graph, longest_path, next_step

GRAPH = load_graph()


def test_no_path_asks_more_than_eight_questions() -> None:
    assert longest_path(GRAPH) <= 8


def test_every_outcome_is_reachable() -> None:
    reached: set[str] = set()

    def walk(question_id: str) -> None:
        for option in GRAPH.questions[question_id]["options"]:
            if "outcome" in option:
                reached.add(option["outcome"])
            else:
                walk(option["question"])

    walk(GRAPH.start)
    assert reached == set(GRAPH.outcomes), "an outcome no answer can reach is dead weight"


def test_every_question_is_reachable() -> None:
    reached = {GRAPH.start}

    def walk(question_id: str) -> None:
        for option in GRAPH.questions[question_id]["options"]:
            nxt = option.get("question")
            if nxt and nxt not in reached:
                reached.add(nxt)
                walk(nxt)

    walk(GRAPH.start)
    assert reached == set(GRAPH.questions), "a question nothing leads to is unreachable"


def test_every_outcome_names_real_product_classes() -> None:
    valid = {member.value for member in ProductClass}
    for outcome in GRAPH.outcomes.values():
        assert outcome.classes, f"{outcome.outcome_id} names no class"
        for name in outcome.classes:
            assert name in valid, f"{outcome.outcome_id} names unknown class {name}"
            # "undetermined" is the absence of a classification, never a result.
            assert name != ProductClass.UNDETERMINED.value


def test_the_graph_states_no_legal_consequence() -> None:
    """The graph decides the class. It must not carry what follows from it.

    Consequences are statements about law and come from retrieved passages. A
    lookup table of them living here is exactly the shortcut this design refuses.
    """
    import json

    from app.services.classification import GRAPH_PATH

    raw = GRAPH_PATH.read_text(encoding="utf-8")
    body = json.loads(raw)
    body.pop("note", None)
    text = json.dumps(body).lower()

    for word in ("licence", "license", "patent act", "rule", "section", "must ", "required"):
        assert word not in text, f"the graph states a consequence: {word!r}"


@pytest.mark.parametrize(
    ("answers", "expected"),
    [
        ({"external_use": "yes"}, ("cosmetic",)),
        ({"external_use": "no", "food_route": "yes", "therapeutic_claim": "no"}, ("ayurveda_aahar",)),
        (
            {"external_use": "no", "food_route": "yes", "therapeutic_claim": "yes"},
            ("ayurveda_aahar", "patent_proprietary"),
        ),
        (
            {"external_use": "no", "food_route": "no", "purified_fraction": "yes"},
            ("phytopharmaceutical",),
        ),
        (
            {
                "external_use": "no",
                "food_route": "no",
                "purified_fraction": "no",
                "classical_unmodified": "yes",
            },
            ("classical_generic",),
        ),
        (
            {
                "external_use": "no",
                "food_route": "no",
                "purified_fraction": "no",
                "classical_unmodified": "no",
                "novel_ingredient": "no",
                "changed_formulation": "yes",
            },
            ("patent_proprietary",),
        ),
        (
            {
                "external_use": "no",
                "food_route": "no",
                "purified_fraction": "no",
                "classical_unmodified": "no",
                "novel_ingredient": "yes",
                "human_evidence": "yes",
            },
            ("new_non_classical_drug",),
        ),
    ],
)
def test_walks_to_the_expected_class(answers: dict[str, str], expected: tuple[str, ...]) -> None:
    _asked, outcome = classify(GRAPH, answers)
    assert outcome is not None
    assert outcome.classes == expected


def test_reaches_the_shortest_answer_in_one_question() -> None:
    """A cosmetic is settled by the first question. Minimum questions means minimum."""
    asked, outcome = classify(GRAPH, {"external_use": "yes"})
    assert asked == ["external_use"]
    assert outcome is not None and outcome.classes == ("cosmetic",)


def test_an_incomplete_walk_returns_no_outcome() -> None:
    asked, outcome = classify(GRAPH, {"external_use": "no"})
    assert outcome is None
    assert asked[-1] == "food_route", "it should stop at the question it needs answered"


def test_some_answers_genuinely_leave_two_routes_open() -> None:
    _asked, outcome = classify(
        GRAPH, {"external_use": "no", "food_route": "yes", "therapeutic_claim": "yes"}
    )
    assert outcome is not None
    assert len(outcome.classes) == 2, "a food making a therapeutic claim is not one route"


def test_an_unknown_answer_is_an_error_rather_than_a_guess() -> None:
    with pytest.raises(KeyError):
        next_step(GRAPH, "external_use", "maybe")
