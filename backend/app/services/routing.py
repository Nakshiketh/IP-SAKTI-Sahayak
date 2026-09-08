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
        "canada",
        "australia",
        "japan",
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


def route(question: str, requested: Jurisdiction) -> Routing:
    tokens = set(tokenize(question, drop_stopwords=False))
    international = sorted(tokens & _INTERNATIONAL_MARKERS)
    india = sorted(tokens & _INDIA_MARKERS)

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
