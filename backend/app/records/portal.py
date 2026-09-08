"""Deep links to services this product does not search.

A portal link is the honest alternative to a fetch. The reader gets taken to the
registry with their terms already filled in; what they must never get is the
impression that the product has already looked. Every surface that renders one
of these says so in as many words.

Two rules hold here, and both are about not building a guess:

* **A link is only built from a template that has been verified.** Every
  `link_template` in the records manifest is null, because nobody has read those
  portals' terms and URL structures yet. `build_link` returns None for those,
  and the interface says the link is pending rather than shipping a URL written
  from memory. A wrong deep link is worse than no link — it looks like a search
  that found nothing.
* **This module never fetches.** It formats a string. There is no HTTP client
  here and there is not going to be one, and the module docstring is where
  somebody tempted to add one should stop.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from urllib.parse import quote

from app.records.types import RecordAccessMode, RecordSource

#: Placeholders a template may use. Anything else is a template error rather
#: than a silently unfilled URL.
PLACEHOLDERS = frozenset({"query", "applicant", "record_id", "classification"})

_PLACEHOLDER = re.compile(r"\{([a-z_]+)\}")


@dataclass(frozen=True)
class PortalLink:
    source_id: str
    name: str
    publisher: str
    jurisdiction: str
    record_type: str
    #: None when no template has been verified for this portal yet.
    url: str | None
    #: What the reader will find there. One line, from the manifest.
    terms_note: str
    #: Always true. Rendered beside the link so nobody has to infer it.
    not_searched_here: bool = True


def template_placeholders(template: str) -> set[str]:
    return set(_PLACEHOLDER.findall(template))


def build_link(source: RecordSource, params: dict[str, str] | None = None) -> str | None:
    """Fill a verified template. Returns None when there is no verified template.

    Values are percent-encoded. A template naming a placeholder nobody supplied
    yields None rather than a URL with a literal `{query}` in it, because that
    URL would load and show the wrong thing.
    """
    if source.access_mode is not RecordAccessMode.PORTAL_LINK_ONLY:
        # Not an error: a bulk source is searched here, not linked out to.
        return None
    if not source.link_template:
        return None

    supplied = params or {}
    wanted = template_placeholders(source.link_template)
    unknown = wanted - PLACEHOLDERS
    if unknown:
        raise ValueError(
            source.source_id + " template uses unknown placeholders: " + ", ".join(sorted(unknown))
        )
    if not wanted.issubset(supplied.keys()):
        return None

    url = source.link_template
    for name in wanted:
        url = url.replace("{" + name + "}", quote(supplied[name], safe=""))
    return url


def links_for(
    sources: list[RecordSource], params: dict[str, str] | None = None
) -> list[PortalLink]:
    """Every portal, whether or not its template has been verified.

    A portal with no verified template is still listed. A reader deciding where
    else to look is better served by knowing the registry exists than by a
    shorter list that hides it.
    """
    return [
        PortalLink(
            source_id=source.source_id,
            name=source.name,
            publisher=source.publisher,
            jurisdiction=source.jurisdiction,
            record_type=source.record_type,
            url=build_link(source, params),
            terms_note=source.terms_note,
        )
        for source in sources
        if source.access_mode is RecordAccessMode.PORTAL_LINK_ONLY
    ]
