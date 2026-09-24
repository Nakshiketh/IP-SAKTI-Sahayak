"""Which regulatory category the product falls in — decided by rules.

The rules in `data/rules/classification_rules.yaml` decide. Nothing in this
module may decide instead: it evaluates stated facts against rules, and when the
facts do not settle it, it says so and names what is missing.

Two behaviours are deliberate and worth stating.

A rule fires only on facts that were stated. A required fact that is unknown
does not fail the rule and does not pass it — the rule simply does not fire, and
the fact is reported as missing. Treating unknown as false would classify a
product on the strength of what someone forgot to mention.

Every rule that is satisfied is kept, not just the winner. Two satisfied rules
are a real ambiguity about the product, and the conflict engine turns them into
a classification conflict that stays unresolved until a fact arrives. Silently
taking the first would hide exactly the case where the reader most needs to know
their situation is not settled.
"""

from __future__ import annotations

from dataclasses import dataclass

from app.models.domain import MissingFact, ProductClass
from app.reasoning.facts import ExtractedFacts, missing
from app.reasoning.rules import ClassificationRule


@dataclass(frozen=True)
class Classification:
    product_class: ProductClass = ProductClass.UNDETERMINED
    #: Other categories whose rules were also satisfied, in rule order.
    alternatives: tuple[ProductClass, ...] = ()
    rule_id: str | None = None
    changes_if: str | None = None
    #: The sources the deciding rule rests on.
    evidence_source_ids: tuple[str, ...] = ()
    missing_facts: tuple[MissingFact, ...] = ()
    #: Categories still open: no stated fact rules them out, but a fact the
    #: rule needs has not been given. Reported when nothing fired, because
    #: "you are one of these three, and this is what decides it" is a far more
    #: useful answer than "undetermined".
    candidates: tuple[ProductClass, ...] = ()
    #: Rules switched off because their evidence is not in the corpus.
    inactive_rule_ids: tuple[str, ...] = ()

    @property
    def ambiguous(self) -> bool:
        """More than one category is in play, whether fired or still open."""
        return bool(self.alternatives) or len(self.candidates) > 1


def _satisfied(rule: ClassificationRule, facts: ExtractedFacts) -> bool:
    return all(facts.value(key) is required for key, required in rule.required_facts.items())


def _still_open(rule: ClassificationRule, facts: ExtractedFacts) -> bool:
    """Could this rule still fire once the unknown facts are known?

    True when nothing stated contradicts it. A rule the facts have ruled out is
    not a candidate, which is what keeps the list short enough to be useful.
    """
    return all(
        facts.value(key) is None or facts.value(key) is required
        for key, required in rule.required_facts.items()
    )


def classify(
    facts: ExtractedFacts,
    rules: list[ClassificationRule],
    material_facts: list[str],
) -> Classification:
    active = [rule for rule in rules if rule.active]
    inactive = tuple(rule.rule_id for rule in rules if not rule.active)
    fired = [rule for rule in active if _satisfied(rule, facts)]
    unknown = tuple(missing(material_facts, facts))

    if not fired:
        open_rules = [rule for rule in active if _still_open(rule, facts)]
        return Classification(
            missing_facts=unknown,
            candidates=tuple(dict.fromkeys(rule.category for rule in open_rules)),
            inactive_rule_ids=inactive,
        )

    decided, *others = fired
    # Two rules reaching the same category is agreement, not ambiguity.
    alternatives = tuple(
        dict.fromkeys(rule.category for rule in others if rule.category is not decided.category)
    )
    return Classification(
        product_class=decided.category,
        alternatives=alternatives,
        rule_id=decided.rule_id,
        changes_if=decided.changes_if,
        evidence_source_ids=decided.evidence_source_ids,
        missing_facts=unknown,
        inactive_rule_ids=inactive,
    )
