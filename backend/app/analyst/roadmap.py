"""The regulatory and IP roadmap: what to do, why, and what it waits on.

Built from the issues the reasoning raised and the sources behind them, not from
a template. A task appears because something in this case put it there, and it
carries the reason so a reader can disagree with it.

The status vocabulary is the load-bearing part, and what it leaves out matters
more than what it contains. There is no "filed", no "approved", no "granted".
This product cannot observe any of those: it does not talk to the patent office,
the NBA or FSSAI, and a checklist that let someone tick "approved" would be
recording a belief as a fact — and then showing it back to them later as though
the product had verified it. The furthest a task can go here is "completed by
you", which says exactly whose assertion it is.

Dependencies are real, not decorative. A prior-art search before the
classification is settled searches for the wrong thing; an ABS position taken
before the origin of the material is known is a guess. Where a task waits on
another, it says so and stays "needs information" until the other is done.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from app.models.domain import IssueType, MissingFact
from app.registry.store import SourceRegistry

#: The five states a task can be in. "Completed by you" is the end of the line:
#: nothing here is ever "filed" or "approved", because this product cannot see
#: either and would be recording a claim as an observation.
NOT_STARTED = "not_started"
NEEDS_INFORMATION = "needs_information"
READY = "ready"
REQUIRES_EXPERT_REVIEW = "requires_expert_review"
COMPLETED_BY_USER = "completed_by_user"

STATUSES = (NOT_STARTED, NEEDS_INFORMATION, READY, REQUIRES_EXPERT_REVIEW, COMPLETED_BY_USER)

#: Statuses this product must never offer, and a test that says so. Each one
#: asserts something only an authority can observe.
FORBIDDEN_STATUSES = ("filed", "approved", "granted", "registered", "rejected")


@dataclass(frozen=True)
class Task:
    task_id: str
    #: A reason key, rendered in the reader's language.
    why_key: str
    status: str
    #: When it can be done: "now", "before_filing", "before_sale".
    when: str
    issue: IssueType | None = None
    #: Registry ids, already checked as citable.
    source_ids: tuple[str, ...] = ()
    #: Tasks that must be done first. A task with an unfinished dependency
    #: cannot be ready, whatever else is known.
    depends_on: tuple[str, ...] = ()
    #: The facts whose absence is holding this task at "needs information".
    needs_facts: tuple[MissingFact, ...] = field(default_factory=tuple)


#: The spine of the roadmap. Order is the order of dependence, not importance.
_TEMPLATE: tuple[tuple[str, str, str, IssueType | None, tuple[str, ...], tuple[str, ...]], ...] = (
    ("confirm-classification", "roadmapWhyClassification", "now", None, (), ()),
    (
        "verify-formulation-references",
        "roadmapWhyFormulationReferences",
        "now",
        IssueType.TRADITIONAL_KNOWLEDGE,
        ("in-tkdl-about",),
        ("confirm-classification",),
    ),
    (
        "document-resource-origin",
        "roadmapWhyResourceOrigin",
        "now",
        IssueType.BIODIVERSITY_ABS,
        ("in-bd-amendment-act-2023",),
        (),
    ),
    (
        "determine-abs-applicability",
        "roadmapWhyAbsApplicability",
        "before_filing",
        IssueType.BIODIVERSITY_ABS,
        ("in-bd-amendment-act-2023", "in-nba-ipr-forms-2025"),
        ("document-resource-origin",),
    ),
    (
        "structured-prior-art-search",
        "roadmapWhyPriorArt",
        "before_filing",
        IssueType.PATENT,
        ("in-portal-patent-search", "intl-patentscope"),
        ("confirm-classification",),
    ),
    (
        "review-patent-exclusions",
        "roadmapWhyExclusions",
        "before_filing",
        IssueType.PATENT,
        ("in-patents-act-1970", "in-ayush-inventions-guidelines-2025"),
        ("structured-prior-art-search",),
    ),
    ("decide-protection-mix", "roadmapWhyProtectionMix", "before_filing", None, (), ()),
    (
        "prepare-regulatory-documents",
        "roadmapWhyRegulatoryDocuments",
        "before_sale",
        IssueType.DRUG_REGULATION,
        ("in-drugs-and-cosmetics-act-rules",),
        ("confirm-classification",),
    ),
    ("check-target-markets", "roadmapWhyTargetMarkets", "before_sale", None, ("intl-pct",), ()),
    ("seek-professional-review", "roadmapWhyProfessionalReview", "now", None, (), ()),
)


def _usable(registry: SourceRegistry | None, ids: tuple[str, ...]) -> tuple[str, ...]:
    if registry is None:
        return ids
    known = set(registry.usable_ids())
    return tuple(source_id for source_id in ids if source_id in known)


def build(
    *,
    issues_indicated: set[IssueType],
    missing_facts: list[MissingFact],
    classification_settled: bool,
    needs_expert_review: bool,
    completed: set[str] | None = None,
    registry: SourceRegistry | None = None,
) -> list[Task]:
    """The roadmap for this case, as it stands.

    A task the case does not raise is left out entirely rather than shown as
    "not applicable": a checklist of things that do not apply to you is how a
    reader learns to stop reading checklists.
    """
    done = completed or set()
    tasks: list[Task] = []

    for task_id, why, when, issue, source_ids, depends_on in _TEMPLATE:
        # Only tasks this case actually raises.
        if issue is not None and issue not in issues_indicated:
            continue
        if task_id == "seek-professional-review" and not needs_expert_review:
            continue

        unmet = tuple(dep for dep in depends_on if dep not in done)
        if task_id in done:
            status = COMPLETED_BY_USER
        elif task_id == "seek-professional-review":
            status = REQUIRES_EXPERT_REVIEW
        elif task_id == "confirm-classification" and not classification_settled:
            status = NEEDS_INFORMATION
        elif unmet:
            # Doing this now would be doing it against facts that are about to
            # change, which is worse than not starting.
            status = NEEDS_INFORMATION
        elif missing_facts and task_id in {"determine-abs-applicability", "decide-protection-mix"}:
            status = NEEDS_INFORMATION
        else:
            status = READY

        tasks.append(
            Task(
                task_id=task_id,
                why_key=why,
                status=status,
                when=when,
                issue=issue,
                source_ids=_usable(registry, source_ids),
                depends_on=unmet,
                needs_facts=tuple(missing_facts) if status is NEEDS_INFORMATION else (),
            )
        )

    return tasks


def changed_facts(before: dict[str, bool], after: dict[str, bool]) -> list[tuple[str, str, str]]:
    """What moved between two runs, as (fact, from, to).

    "Unknown" is a value like any other here: going from not knowing whether a
    product carries a therapeutic claim to knowing it does not is the single
    most common reason an assessment changes, and a diff that only compared
    stated values would report nothing at all.
    """

    def shown(value: bool | None) -> str:
        return "unknown" if value is None else ("yes" if value else "no")

    keys = sorted(set(before) | set(after))
    return [
        (key, shown(before.get(key)), shown(after.get(key)))
        for key in keys
        if before.get(key) != after.get(key)
    ]
