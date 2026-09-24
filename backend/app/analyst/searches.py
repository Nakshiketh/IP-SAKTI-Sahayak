"""Building a prior-art search someone can run, and refusing to run it for them.

The output is a search strategy: concepts, names, process terms and the strings
to paste into the official search pages. It is never a result, and the banner
says so on every one. A generated search string that found nothing would be the
easiest possible way to leave someone believing their formulation is novel, and
this product must not do that.

Two restraints:

* A botanical name is marked validated only when it appears in the stored
  reference vocabulary, which carries the binomials alongside the common names.
  Anything else is offered as written and marked unvalidated, because a
  misspelled or invented binomial silently searches for nothing.
* IPC and CPC hints are absent. They belong to the official IPC publication,
  which this repo does not hold, and guessing a classification code would send
  someone down a branch of the scheme their invention is not in.

Links point at the official search pages. Nothing is fetched or scraped.
"""

from __future__ import annotations

from dataclasses import dataclass

from app.analyst.models import Invention
from app.analyst.vocabulary import Vocabulary, fold
from app.registry.store import SourceRegistry

#: The official search surfaces, by registry id. A page is offered only when the
#: registry says its source is citable, so a withdrawn portal stops being
#: suggested rather than sending someone to a dead link.
SEARCH_PAGES = {
    "in-portal-patent-search": "https://iprsearch.ipindia.gov.in/PublicSearch/",
    "intl-patentscope": "https://patentscope.wipo.int/search/en/search.jsf",
    "in-tkdl": "https://www.tkdl.res.in/",
}

#: Words that describe how something is made. Collected from the process the
#: person described, never invented.
PROCESS_HINTS = (
    "extract",
    "extraction",
    "decoction",
    "distillation",
    "fermentation",
    "granulation",
    "standardisation",
    "standardization",
    "purification",
    "encapsulation",
    "emulsion",
    "trituration",
)


@dataclass(frozen=True)
class SearchTerm:
    text: str
    #: "common", "botanical", "process", "use" or "feature".
    kind: str
    #: True only for a botanical name found in the stored reference vocabulary.
    validated: bool = False


@dataclass(frozen=True)
class SearchPage:
    source_id: str
    url: str
    query: str


@dataclass(frozen=True)
class SearchStrategy:
    terms: tuple[SearchTerm, ...]
    pages: tuple[SearchPage, ...]
    #: Always present, in every language, on every strategy.
    banner_key: str = "priorArtNoConclusion"
    #: Said plainly wherever the TKDL is offered.
    tkdl_access_note_key: str | None = None


def _botanicals(invention: Invention, vocabulary: Vocabulary) -> list[SearchTerm]:
    """Binomials for the ingredients, validated against the stored vocabulary."""
    terms: list[SearchTerm] = []
    seen: set[str] = set()
    for ingredient in invention.ingredients:
        term = vocabulary.terms.get(ingredient.vocabulary_id or "")
        if term is None:
            # A name the vocabulary does not hold. Offered as the person wrote
            # it, marked unvalidated, never "corrected" into a binomial.
            if fold(ingredient.name) not in seen:
                seen.add(fold(ingredient.name))
                terms.append(SearchTerm(text=ingredient.name, kind="common", validated=False))
            continue
        for name in term.names:
            # A binomial is two Latin words; the common names in the same list
            # are one word or a transliteration.
            parts = name.split()
            binomial = len(parts) == 2 and all(p.isascii() and p.isalpha() for p in parts)
            if binomial and name not in seen:
                seen.add(name)
                terms.append(SearchTerm(text=name, kind="botanical", validated=True))
        if fold(term.label) not in seen:
            seen.add(fold(term.label))
            terms.append(SearchTerm(text=term.label, kind="common", validated=True))
    return terms


def _process_terms(invention: Invention) -> list[SearchTerm]:
    text = " ".join([*invention.process_steps, *invention.process_parameters]).lower()
    return [
        SearchTerm(text=hint, kind="process", validated=False)
        for hint in PROCESS_HINTS
        if hint in text
    ]


def _quote(text: str) -> str:
    return f'"{text}"' if " " in text else text


def build_strategy(
    invention: Invention,
    vocabulary: Vocabulary,
    registry: SourceRegistry | None = None,
) -> SearchStrategy:
    terms = _botanicals(invention, vocabulary)
    terms += _process_terms(invention)
    terms += [
        SearchTerm(text=feature, kind="feature", validated=False)
        for feature in invention.distinctive_features
    ]
    terms += [SearchTerm(text=use, kind="use", validated=False) for use in invention.use_terms]

    # The string a person pastes in. Botanicals are OR-ed because a patent may
    # name any one of them; process and feature terms are AND-ed because they
    # narrow. Validated names first, so a search that is cut short is cut short
    # at the least reliable end.
    botanical = [term.text for term in terms if term.kind == "botanical"]
    common = [term.text for term in terms if term.kind == "common"]
    narrowing = [term.text for term in terms if term.kind in {"process", "feature"}]
    subject = botanical or common
    query = " OR ".join(_quote(text) for text in subject[:6])
    if query and narrowing:
        query = f"({query}) AND " + " AND ".join(_quote(text) for text in narrowing[:3])

    usable = set(registry.usable_ids()) if registry is not None else set(SEARCH_PAGES)
    pages = tuple(
        SearchPage(source_id=source_id, url=url, query=query)
        for source_id, url in SEARCH_PAGES.items()
        if source_id in usable and query
    )
    return SearchStrategy(
        terms=tuple(terms),
        pages=pages,
        tkdl_access_note_key=(
            "tkdlAccessLimited" if any(p.source_id == "in-tkdl" for p in pages) else None
        ),
    )
