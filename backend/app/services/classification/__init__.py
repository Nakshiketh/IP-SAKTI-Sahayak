"""Product classification: walk a decision graph to a regulatory class.

The graph is `graph.json` in this package — a data file, not code, so the flow
can be revised without a deploy. It holds structure only: question ids, options
and the outcomes they lead to. Every piece of text is a key into the locale
files, and no legal consequence is stated in it.

That separation is the point. The graph decides *what the product is*. What
follows from that — the regulatory route, the intellectual property posture, the
access and benefit-sharing duties — comes from retrieved passages, because those
are statements about law and this product does not make them from a lookup table.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

GRAPH_PATH = Path(__file__).parent / "graph.json"


@dataclass(frozen=True)
class Outcome:
    """A leaf of the graph.

    ``classes`` may hold more than one: some answers genuinely leave two routes
    open, and saying so is better than picking the likelier.
    """

    outcome_id: str
    classes: tuple[str, ...]


@dataclass(frozen=True)
class Graph:
    start: str
    questions: dict[str, dict]
    outcomes: dict[str, Outcome]


def load_graph(path: Path | None = None) -> Graph:
    raw = json.loads((path or GRAPH_PATH).read_text(encoding="utf-8"))
    return Graph(
        start=raw["start"],
        questions=raw["questions"],
        outcomes={
            key: Outcome(outcome_id=key, classes=tuple(value["classes"]))
            for key, value in raw["outcomes"].items()
        },
    )


def next_step(graph: Graph, question_id: str, answer: str) -> tuple[str | None, Outcome | None]:
    """Given an answer, return the next question id or the outcome reached."""
    question = graph.questions.get(question_id)
    if question is None:
        raise KeyError(f"unknown question: {question_id}")

    for option in question["options"]:
        if option["value"] != answer:
            continue
        if "outcome" in option:
            return None, graph.outcomes[option["outcome"]]
        return option["question"], None

    raise KeyError(f"unknown answer {answer!r} for question {question_id!r}")


def classify(graph: Graph, answers: dict[str, str]) -> tuple[list[str], Outcome | None]:
    """Walk the graph with the answers given.

    Returns the questions asked, in order, and the outcome if one was reached.
    Answers for questions the walk never visits are ignored — which is what
    "skipping anything already known" means in practice.
    """
    asked: list[str] = []
    current: str | None = graph.start

    while current is not None:
        asked.append(current)
        answer = answers.get(current)
        if answer is None:
            return asked, None
        current, outcome = next_step(graph, current, answer)
        if outcome is not None:
            return asked, outcome

    return asked, None


def longest_path(graph: Graph) -> int:
    """How many questions the worst case asks. The build document caps it at 8."""
    seen: set[str] = set()

    def depth(question_id: str) -> int:
        if question_id in seen:
            raise ValueError(f"cycle through {question_id}")
        seen.add(question_id)
        best = 0
        for option in graph.questions[question_id]["options"]:
            if "question" in option:
                best = max(best, depth(option["question"]))
        seen.discard(question_id)
        return best + 1

    return depth(graph.start)
