"""What the registry knows about one source, and how far it has been checked.

Two fields carry the weight. `review_state` says how far provenance has been
established, and `authority_level` says what kind of authority the document is
— a statute is not a portal page, and an answer that leans on the second should
not look like one resting on the first.

Everything unknown stays null. A null date is rendered as "unknown"; it is
never filled with a guess, because a date on a legal source is itself a claim.
"""

from __future__ import annotations

from datetime import date, datetime
from enum import StrEnum
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.models.domain import Jurisdiction


class ReviewState(StrEnum):
    """How far the provenance of a source has been established."""

    #: Fetched from an allowlisted official host, bytes hashed. Citable.
    VERIFIED_OFFICIAL = "verified_official"
    #: Verified, and a person confirmed the stored text against the original.
    HUMAN_REVIEWED = "human_reviewed"
    #: Known official source that could not be fetched or needs a human eye.
    NEEDS_REVIEW = "needs_review"
    #: Registered from a manifest, with no fetch behind it yet.
    UNVERIFIED = "unverified"
    #: Replaced by a later version; kept so an old answer can be explained.
    SUPERSEDED = "superseded"
    #: The official host no longer serves it.
    UNAVAILABLE = "unavailable"


#: The states whose sources may be cited in an answer. `legacy_allowed` widens
#: this for one record at a time; see `SourceRecord.usable`.
USABLE_STATES: frozenset[ReviewState] = frozenset(
    {ReviewState.VERIFIED_OFFICIAL, ReviewState.HUMAN_REVIEWED}
)

#: Authority levels, as the core rules define them:
#: 1 statutes, rules, gazette notifications, treaty texts
#: 2 official notifications, orders, guidelines, standards
#: 3 official FAQs, manuals and portal pages
#: 4 official registry records
#: 5 labelled secondary sources
AUTHORITY_LEVEL_BY_TYPE: dict[str, int] = {
    "act": 1,
    "rules": 1,
    "regulation": 1,
    "treaty": 1,
    "notification": 1,
    "guideline": 2,
    "pharmacopoeia": 2,
    "form": 2,
    "case_law": 2,
}


class SourceRecord(BaseModel):
    """One document, and the state of its provenance."""

    model_config = ConfigDict(extra="forbid", use_enum_values=False)

    source_id: str
    title: str
    #: The body that issued or publishes it.
    authority: str
    jurisdiction: Jurisdiction
    document_type: str
    legal_area: list[str] = Field(default_factory=list)
    #: 1 (statute) to 5 (secondary). Null when it cannot be decided honestly.
    authority_level: int | None = None
    official_url: str | None = None
    publication_date: date | None = None
    effective_date: date | None = None
    amendment_status: str | None = None
    retrieved_at: datetime | None = None
    reviewed_at: date | None = None
    reviewed_by: str | None = None
    version: str | None = None
    #: Hash of the bytes fetched from `official_url`, not of any local copy.
    sha256: str | None = None
    supersedes: list[str] = Field(default_factory=list)
    superseded_by: str | None = None
    primary_or_secondary: Literal["primary", "secondary"] | None = None
    citation_allowed: bool = True
    full_text_available: bool = False
    #: "interactive_portal", "subscription", "patent_offices_only", …
    access_restriction: str | None = None
    review_state: ReviewState = ReviewState.UNVERIFIED
    #: A source known to be official that cannot be re-fetched today. It stays
    #: citable and says "provenance pending review", and it caps the confidence
    #: of any answer that rests on it.
    legacy_allowed: bool = False
    notes: str | None = None

    # -- treaties only ----------------------------------------------------
    adopted_date: date | None = None
    entry_into_force_status: str | None = None
    india_status: str | None = None
    status_source_url: str | None = None
    status_checked_at: date | None = None

    @property
    def usable(self) -> bool:
        """May an answer cite this source?"""
        return self.citation_allowed and (self.review_state in USABLE_STATES or self.legacy_allowed)

    def outranks(self, other: SourceRecord) -> bool:
        """Does this source control the other on the same point?

        Lower level wins: an Act (1) controls an official guideline (2), which
        controls a portal page (3). An unknown level never outranks anything,
        because "we do not know what this is" is not authority. Retrieval
        starts weighting by this in Phase 2; today it is what the registry
        asserts, and what the tests hold it to.
        """
        if self.authority_level is None or other.authority_level is None:
            return False
        return self.authority_level < other.authority_level

    @property
    def provenance_pending(self) -> bool:
        """Citable, but only because it was let through as a known official source."""
        return self.usable and self.review_state not in USABLE_STATES
