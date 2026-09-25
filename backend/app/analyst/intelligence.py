"""Everything Check My Product works out that is not a comparison.

One entry point, so the pieces cannot be assembled differently in different
places: the same classification rules Ask Sahayak uses, the ABS question, a
prior-art search someone can actually run, the protection map, and the first
tasks that follow.

The order is the order of dependence. Facts first, because the rules read them.
Classification next, because the issues follow from the category. ABS and the
protection map read both. The roadmap comes last because it is the only part
that is about what to do rather than what is true.
"""

from __future__ import annotations

from app.analyst import abs as abs_module
from app.analyst import roadmap as roadmap_module
from app.analyst.facts_bridge import facts_of, missing_from_declines
from app.analyst.models import (
    AbsView,
    ClassificationView,
    Intelligence,
    Invention,
    ProtectionView,
    RoadmapTaskView,
    SearchPageView,
    SearchStrategyView,
    SearchTermView,
)
from app.analyst.protection import ProtectionEntry, protection_map
from app.analyst.searches import SearchStrategy, build_strategy
from app.analyst.vocabulary import Vocabulary
from app.models.domain import IssueType, Jurisdiction, ProductClass
from app.reasoning import analyse
from app.registry.store import SourceRegistry


def _abs_facts(invention: Invention, stated: dict[str, bool]) -> dict[str, bool]:
    """The ABS intake answers this conversation has actually established.

    Only what is known goes in. A key left out is reported back as a question,
    which is the whole point of asking only material ones.
    """
    facts: dict[str, bool] = {}
    if "uses_biological_resource" in stated:
        facts["uses_biological_resource"] = stated["uses_biological_resource"]
    if invention.source_texts:
        facts["associated_traditional_knowledge"] = True
    return facts


def build(
    invention: Invention,
    vocabulary: Vocabulary,
    *,
    declined: list[str] | None = None,
    #: Tasks the person has ticked off. Their assertion, kept as theirs.
    completed: set[str] | None = None,
    corpus_document_ids: frozenset[str] = frozenset(),
    registry: SourceRegistry | None = None,
) -> Intelligence:
    facts = facts_of(invention, declined)
    stated = facts.as_map()

    analysis = analyse(
        invention.intended_use or invention.title or "",
        passages=[],
        jurisdiction=Jurisdiction.IN,
        corpus_document_ids=corpus_document_ids,
        registry=registry,
        # The structured facts are better evidence than the sentence, so they
        # are handed over rather than re-derived from prose.
        known_facts=facts,
    )

    missing = list(analysis.missing_facts)
    for fact in missing_from_declines(declined or []):
        if all(existing.key != fact.key for existing in missing):
            missing.append(fact)

    abs_finding = abs_module.assess_abs(_abs_facts(invention, stated), registry=registry)
    strategy: SearchStrategy = build_strategy(invention, vocabulary, registry)
    entries: list[ProtectionEntry] = protection_map(invention, facts, registry)
    tasks = roadmap_module.build(
        issues_indicated={
            IssueType(finding.issue.value)
            for finding in analysis.issues
            if finding.status.value == "indicated"
        },
        missing_facts=missing,
        classification_settled=analysis.product_class is not ProductClass.UNDETERMINED,
        needs_expert_review=bool(
            analysis.escalation and analysis.escalation.level.value in {"l2", "l3"}
        ),
        completed=completed,
        registry=registry,
    )

    return Intelligence(
        facts=list(facts.stated),
        missing_facts=missing,
        classification=ClassificationView(
            product_class=analysis.product_class,
            alternatives=list(analysis.alternative_classes),
            rule_id=analysis.classification_rule_id,
            changes_if=analysis.changes_if,
            ambiguous=bool(analysis.alternative_classes),
        ),
        issues_indicated=[
            finding.issue.value
            for finding in analysis.issues
            if finding.status.value == "indicated"
        ],
        escalation_level=(analysis.escalation.level.value if analysis.escalation else None),
        escalation_specialists=(
            list(analysis.escalation.specialists) if analysis.escalation else []
        ),
        abs=AbsView(
            relevance=abs_finding.relevance,
            reason_keys=list(abs_finding.reason_keys),
            missing_facts=list(abs_finding.missing_facts),
            source_ids=list(abs_finding.source_ids),
            requires_human_review=abs_finding.requires_human_review,
        ),
        searches=SearchStrategyView(
            terms=[SearchTermView(**vars(term)) for term in strategy.terms],
            pages=[SearchPageView(**vars(page)) for page in strategy.pages],
            banner_key=strategy.banner_key,
            tkdl_access_note_key=strategy.tkdl_access_note_key,
        ),
        protection=[
            ProtectionView(
                right=entry.right,
                relevance=entry.relevance,
                reason_keys=list(entry.reason_keys),
                facts_required=list(entry.facts_required),
                source_ids=list(entry.source_ids),
                next_step_key=entry.next_step_key,
            )
            for entry in entries
        ],
        roadmap=[
            RoadmapTaskView(
                task_id=task.task_id,
                why_key=task.why_key,
                status=task.status,
                when=task.when,
                issue=task.issue.value if task.issue else None,
                source_ids=list(task.source_ids),
                depends_on=list(task.depends_on),
                needs_facts=list(task.needs_facts),
            )
            for task in tasks
        ],
    )
