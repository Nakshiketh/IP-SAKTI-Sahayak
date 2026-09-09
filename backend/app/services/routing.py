"""Which namespace a query reads, and how many answers come back.

Rule 2 of the product is that India and International are never mixed. This
module is where that is decided, and it is deliberately the smallest module in
the pipeline: the whole rule is that a route names exactly one namespace, and a
question about both produces two routes rather than one wider one.

The cross-border case is the one worth being careful about. "Can we sell this in
India and the UK" is not a query with two filters, it is two questions that
happen to have been typed together. They retrieve separately, generate
separately, and arrive at the interface as two answer sets the reader switches
between. Nothing merges them, at any layer, ever.
"""

from __future__ import annotations

from dataclasses import dataclass

from app.models.domain import Jurisdiction
from app.retrieval.tokenize import fold, tokenize

#: Words that put a question in the international namespace even when the reader
#: has left the toggle on India. Matched on folded tokens.
_INTERNATIONAL_MARKERS: frozenset[str] = frozenset(
    fold(word)
    for word in (
        "abroad",
        "overseas",
        "export",
        "exporting",
        "international",
        "foreign",
        "uk",
        "britain",
        "england",
        "eu",
        "europe",
        "european",
        "us",
        "usa",
        "america",
        "gulf",
        "uae",
        "wipo",
        "madrid",
        "pct",
        "nagoya",
    )
)

_INDIA_MARKERS: frozenset[str] = frozenset(
    fold(word) for word in ("india", "indian", "domestic", "cdsco", "ayush", "fssai", "nba")
)

#: Places the corpus policy does not cover. Naming one is not a routing question
#: — there is no namespace to send it to — so the pipeline stops and says the
#: sources do not reach there.
#:
#: Found by the gold set. Before this existed, "what are the patent rules in
#: Brazil for our herbal formulation" retrieved enough Indian passages to clear
#: the floor and was answered: an answer about India, to a question about
#: Brazil, with nothing on the screen saying so. Scope discipline in
#: `docs/CORPUS_POLICY.md` is India, the United Kingdom, the European Union and
#: the United States; everywhere else belongs here until it is ingested.
_UNCOVERED: dict[str, str] = {
    fold(word): name
    for word, name in (
        ("brazil", "Brazil"),
        ("brazilian", "Brazil"),
        ("japan", "Japan"),
        ("japanese", "Japan"),
        ("china", "China"),
        ("chinese", "China"),
        ("russia", "Russia"),
        ("nigeria", "Nigeria"),
        ("kenya", "Kenya"),
        ("indonesia", "Indonesia"),
        ("canada", "Canada"),
        ("canadian", "Canada"),
        ("australia", "Australia"),
        ("australian", "Australia"),
        ("korea", "Korea"),
        ("mexico", "Mexico"),
        ("thailand", "Thailand"),
        ("vietnam", "Vietnam"),
        ("bangladesh", "Bangladesh"),
        ("nepal", "Nepal"),
        ("srilanka", "Sri Lanka"),
        ("lanka", "Sri Lanka"),
        ("pakistan", "Pakistan"),
    )
}


@dataclass(frozen=True)
class Route:
    """One namespace, and why it was chosen."""

    jurisdiction: Jurisdiction
    #: True when the reader did not ask for this namespace and it was inferred.
    inferred: bool
    #: The token that put the question here, or None when it came from the toggle.
    marker: str | None = None


@dataclass(frozen=True)
class Routing:
    routes: tuple[Route, ...]
    #: True when the question named both sides. Two answer sets, never one.
    cross_border: bool
    #: Set when the question names a place the corpus does not cover. There is
    #: no namespace to route it to, so the pipeline declines rather than
    #: answering it from a jurisdiction the reader did not ask about.
    uncovered: str | None = None


def route(question: str, requested: Jurisdiction) -> Routing:
    tokens = set(tokenize(question, drop_stopwords=False))
    international = sorted(tokens & _INTERNATIONAL_MARKERS)
    india = sorted(tokens & _INDIA_MARKERS)

    # An uncovered place wins over everything else. A question naming both
    # Brazil and India is still a question the sources cannot answer about
    # Brazil, and answering the Indian half without saying so would be worse
    # than declining.
    uncovered = sorted(name for token, name in _UNCOVERED.items() if token in tokens)
    if uncovered:
        return Routing(
            routes=(Route(requested, inferred=False),),
            cross_border=False,
            uncovered=uncovered[0],
        )

    if international and india:
        return Routing(
            routes=(
                Route(Jurisdiction.IN, inferred=requested is not Jurisdiction.IN, marker=india[0]),
                Route(
                    Jurisdiction.INTL,
                    inferred=requested is not Jurisdiction.INTL,
                    marker=international[0],
                ),
            ),
            cross_border=True,
        )

    if international and requested is Jurisdiction.IN:
        # The reader asked about somewhere else while the toggle said India.
        # Answer where they asked about, and the interface says it switched.
        return Routing(
            routes=(Route(Jurisdiction.INTL, inferred=True, marker=international[0]),),
            cross_border=False,
        )

    if india and requested is Jurisdiction.INTL:
        return Routing(
            routes=(Route(Jurisdiction.IN, inferred=True, marker=india[0]),),
            cross_border=False,
        )

    return Routing(routes=(Route(requested, inferred=False),), cross_border=False)
