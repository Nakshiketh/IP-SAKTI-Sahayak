"""Access and benefit sharing: whether it is likely to arise, and what is unknown.

This never decides that an obligation applies. Whether a particular material is
a "biological resource", whether a standardised extract is a "value-added
product", and whether a particular applicant is covered are questions that turn
on definitions in the Biological Diversity Act and on facts about the applicant
— and they are decided by the National Biodiversity Authority and the courts,
not here. What this module does is narrower and honest: it says the question
arises, names what is not known, and points at the official source.

Two rules it holds to:

* A form or a portal is named only when the registry holds it as a citable
  source. An invented form number is the most damaging kind of error this
  product could make, because someone would go and look for it.
* Where the answer turns on a definition, the output says a person must decide,
  and carries `requires_human_review`. It does not pick a reading.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from app.models.domain import MissingFact
from app.registry.store import SourceRegistry

#: The sources this module may point at, in order of authority. Each is checked
#: against the registry before it is offered; one that is not citable is left
#: out rather than mentioned.
SOURCE_IDS = (
    "in-bd-amendment-act-2023",
    "in-nba-ipr-forms-2025",
    "in-tk-biological-material-guidelines",
    "in-portal-nba-abs",
    "intl-nagoya-protocol",
    "intl-absch",
)

#: What has to be known before anyone can say whether ABS applies. These are the
#: questions the intake asks; everything else is not material to it.
MATERIAL_QUESTIONS: dict[str, str] = {
    "uses_biological_resource": (
        "Does the product use a biological resource — a plant, part, extract or derivative?"
    ),
    "resource_origin": (
        "Where was the material obtained, and was it collected from the wild or cultivated?"
    ),
    "indian_source": "Was the material obtained in India?",
    "associated_traditional_knowledge": (
        "Is knowledge associated with the resource being used — a traditional use or preparation?"
    ),
    "purpose": "Is it for research, for commercial use, or both?",
    "applicant_is_foreign": (
        "Is the applicant a foreign national, a non-resident, or a body corporate "
        "registered outside India?"
    ),
    "ip_application_planned": (
        "Is an intellectual property application planned on the basis of this material?"
    ),
}


@dataclass(frozen=True)
class AbsFinding:
    """Whether ABS is in play, what is missing, and where to read about it."""

    #: "likely", "possible" or "not_indicated". Never "required".
    relevance: str
    reason_keys: tuple[str, ...] = ()
    missing_facts: tuple[MissingFact, ...] = ()
    #: Registry source ids, already checked as citable.
    source_ids: tuple[str, ...] = ()
    #: Set when the answer turns on a definition somebody has to apply.
    requires_human_review: bool = False
    #: What the official route looks like, only where a usable source describes
    #: it. Empty is a truthful answer.
    procedural_notes: tuple[str, ...] = field(default_factory=tuple)


def citable_sources(registry: SourceRegistry | None) -> tuple[str, ...]:
    if registry is None:
        return ()
    usable = set(registry.usable_ids())
    return tuple(source_id for source_id in SOURCE_IDS if source_id in usable)


def assess_abs(
    facts: dict[str, bool],
    *,
    registry: SourceRegistry | None = None,
) -> AbsFinding:
    """Read the intake answers. Decide nothing that a definition decides."""
    sources = citable_sources(registry)
    uses_resource = facts.get("uses_biological_resource")
    unknown = tuple(
        MissingFact(key=key, question=question)
        for key, question in MATERIAL_QUESTIONS.items()
        if key not in facts
    )

    if uses_resource is False:
        return AbsFinding(
            relevance="not_indicated",
            reason_keys=("absNoBiologicalResource",),
            missing_facts=unknown,
            source_ids=sources,
        )

    if uses_resource is None:
        return AbsFinding(
            relevance="possible",
            reason_keys=("absResourceUnknown",),
            missing_facts=unknown,
            source_ids=sources,
            requires_human_review=False,
        )

    reasons = ["absBiologicalResourceUsed"]
    if facts.get("associated_traditional_knowledge"):
        reasons.append("absAssociatedTraditionalKnowledge")
    if facts.get("ip_application_planned"):
        reasons.append("absIpApplicationPlanned")
    if facts.get("applicant_is_foreign"):
        reasons.append("absForeignApplicant")

    # Whether this particular material and this particular applicant fall inside
    # the Act is a reading of its definitions. The question is raised; the
    # reading is left to the people whose job it is.
    return AbsFinding(
        relevance="likely",
        reason_keys=tuple(reasons),
        missing_facts=unknown,
        source_ids=sources,
        requires_human_review=True,
        procedural_notes=(("absReadTheAct",) if sources else ()),
    )
