"""The IP Protection Map, and the first tasks that follow from it.

Six rights, each in one of four states. The fourth state is the one that earns
its place: "needs more information" is different from "not indicated", because
one says the facts rule it out and the other says nobody has asked yet. A map
that collapsed them would quietly tell someone they have no trade mark position
when the truth is that they never mentioned a name.

Each entry carries why it says what it says, which facts would settle it, and
one next step. The next step is an action a person can take — look something up,
ask someone, decide something — never a prediction about what will follow.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from app.analyst.models import Invention
from app.models.domain import IssueType, MissingFact
from app.reasoning.facts import ExtractedFacts
from app.registry.store import SourceRegistry

RIGHTS = ("patent", "trademark", "design", "copyright", "geographical_indication", "trade_secret")

#: Relevance states, weakest claim first.
RELEVANT = "relevant"
POSSIBLY_RELEVANT = "possibly_relevant"
NEEDS_MORE_INFORMATION = "needs_more_information"
NOT_INDICATED = "not_indicated"

#: Right -> the sources that describe it. Offered only when citable.
SOURCES: dict[str, tuple[str, ...]] = {
    "patent": ("in-patents-act-1970", "in-patents-rules-2003", "in-patent-office-manual"),
    "trademark": ("in-trade-marks-basics", "in-trade-marks-filing-process"),
    "design": ("in-designs-basics", "in-portal-design"),
    "copyright": ("in-copyright-basics",),
    "geographical_indication": ("in-gi-introduction", "in-portal-gi"),
    "trade_secret": ("in-law-commission-289",),
}

#: Right -> the fact that decides whether it is in play at all.
DECIDING_FACT: dict[str, str] = {
    "trademark": "brand_name",
    "patent": "new_process",
}


@dataclass(frozen=True)
class ProtectionEntry:
    right: str
    relevance: str
    reason_keys: tuple[str, ...] = ()
    #: Facts that would move this out of "needs more information".
    facts_required: tuple[MissingFact, ...] = ()
    source_ids: tuple[str, ...] = ()
    next_step_key: str | None = None


@dataclass(frozen=True)
class RoadmapTask:
    """One thing to do. Ordered by what has to happen before what."""

    task_id: str
    #: "now", "before_filing" or "before_sale".
    when: str
    issue: IssueType | None = None
    source_ids: tuple[str, ...] = field(default_factory=tuple)
    #: True when the task exists only because something is unknown.
    resolves_missing_fact: bool = False


def _usable(registry: SourceRegistry | None, ids: tuple[str, ...]) -> tuple[str, ...]:
    if registry is None:
        return ids
    known = set(registry.usable_ids())
    return tuple(source_id for source_id in ids if source_id in known)


def _question_for(key: str, facts: ExtractedFacts) -> MissingFact | None:
    from app.reasoning.rules import get_fact_rules

    definition = get_fact_rules().definitions.get(key)
    if definition is None or facts.value(key) is not None:
        return None
    return MissingFact(key=key, question=definition.question)


def protection_map(
    invention: Invention,
    facts: ExtractedFacts,
    registry: SourceRegistry | None = None,
) -> list[ProtectionEntry]:
    entries: list[ProtectionEntry] = []

    for right in RIGHTS:
        sources = _usable(registry, SOURCES.get(right, ()))
        key = DECIDING_FACT.get(right)
        missing = _question_for(key, facts) if key else None

        if right == "patent":
            if facts.value("new_process") is True or invention.distinctive_features:
                relevance, reasons = RELEVANT, ("protectionProcessDescribed",)
            elif missing is not None:
                relevance, reasons = NEEDS_MORE_INFORMATION, ("protectionNeedProcess",)
            else:
                relevance, reasons = POSSIBLY_RELEVANT, ("protectionPatentGeneral",)
            next_step = "protectionStepPriorArtSearch"

        elif right == "trademark":
            if invention.brand_name:
                relevance, reasons = RELEVANT, ("protectionBrandGiven",)
                next_step = "protectionStepSearchRegister"
            elif missing is not None:
                relevance, reasons = NEEDS_MORE_INFORMATION, ("protectionNeedBrand",)
                next_step = "protectionStepDecideName"
            else:
                relevance, reasons = NOT_INDICATED, ("protectionNoBrand",)
                next_step = None

        elif right == "design":
            if invention.packaging_note:
                relevance, reasons = POSSIBLY_RELEVANT, ("protectionPackagingMentioned",)
                next_step = "protectionStepDesignNovelty"
            else:
                relevance, reasons = NEEDS_MORE_INFORMATION, ("protectionNeedAppearance",)
                next_step = "protectionStepDescribeAppearance"

        elif right == "copyright":
            relevance, reasons = POSSIBLY_RELEVANT, ("protectionLabelAndText",)
            next_step = "protectionStepKeepRecords"

        elif right == "geographical_indication":
            if invention.region_note:
                relevance, reasons = POSSIBLY_RELEVANT, ("protectionRegionMentioned",)
                next_step = "protectionStepCheckGiRegister"
            else:
                relevance, reasons = NOT_INDICATED, ("protectionNoOriginClaim",)
                next_step = None

        else:  # trade_secret
            if invention.disclosure == "confidential":
                relevance, reasons = RELEVANT, ("protectionKeptConfidential",)
                next_step = "protectionStepWriteItDown"
            elif invention.disclosure == "public":
                relevance, reasons = NOT_INDICATED, ("protectionAlreadyPublic",)
                next_step = None
            else:
                relevance, reasons = NEEDS_MORE_INFORMATION, ("protectionNeedDisclosure",)
                next_step = "protectionStepDecideDisclosure"

        entries.append(
            ProtectionEntry(
                right=right,
                relevance=relevance,
                reason_keys=reasons,
                facts_required=(missing,) if missing is not None else (),
                source_ids=sources,
                next_step_key=next_step,
            )
        )
    return entries


def roadmap_seed(
    entries: list[ProtectionEntry],
    missing_facts: list[MissingFact],
    abs_relevance: str,
    registry: SourceRegistry | None = None,
) -> list[RoadmapTask]:
    """The first tasks, in the order the obligations actually bite.

    A seed, not a plan: it holds what follows from what has been said so far,
    and every task that exists only because something is unknown says so, so the
    list shrinks as the person answers rather than growing.
    """
    tasks: list[RoadmapTask] = []

    for fact in missing_facts:
        tasks.append(
            RoadmapTask(
                task_id="answer-" + fact.key,
                when="now",
                resolves_missing_fact=True,
            )
        )

    if abs_relevance in {"likely", "possible"}:
        # Before filing, because an application on material covered by the Act
        # is the point at which the question stops being hypothetical.
        tasks.append(
            RoadmapTask(
                task_id="check-abs-position",
                when="before_filing",
                issue=IssueType.BIODIVERSITY_ABS,
                source_ids=_usable(registry, ("in-bd-amendment-act-2023", "in-nba-ipr-forms-2025")),
            )
        )

    for entry in entries:
        if entry.relevance is RELEVANT and entry.next_step_key:
            tasks.append(
                RoadmapTask(
                    task_id=entry.next_step_key,
                    when="before_filing" if entry.right == "patent" else "before_sale",
                    source_ids=entry.source_ids,
                )
            )
    return tasks
