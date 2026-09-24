"""Loading the rule files, and refusing to run on rules that are not backed.

The rules live in `data/rules/*.yaml` rather than in this package because they
are the part a domain expert should be able to read and change without reading
Python. What this module adds is the check that makes them safe to trust: a
classification rule is active only when every source it cites is one the
registry allows to be cited *and* the corpus actually holds a passage from it.

That check is the difference between a rule and an assertion. "This is a
phytopharmaceutical" is a claim about Indian drug regulation; it is allowed here
only because Rule 2(eb) is in the corpus and the registry has fetched the
instrument it comes from. Remove either and the rule switches itself off rather
than carrying on unsupported.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path

import yaml

from app.core.settings import REPO_ROOT
from app.models.domain import ProductClass

RULES_DIR = REPO_ROOT / "data" / "rules"


@dataclass(frozen=True)
class ClassificationRule:
    rule_id: str
    order: int
    category: ProductClass
    #: fact key -> the value it must have for this rule to fire.
    required_facts: dict[str, bool]
    evidence_source_ids: tuple[str, ...]
    changes_if: str
    #: False when the evidence is missing, unciteable or withdrawn. An inactive
    #: rule classifies nothing; it does not fall back to a weaker claim.
    active: bool = True
    inactive_reason: str | None = None


@dataclass(frozen=True)
class FactDefinition:
    key: str
    question: str
    yes_phrases: tuple[tuple[str, ...], ...]
    no_phrases: tuple[tuple[str, ...], ...]


@dataclass(frozen=True)
class FactRules:
    definitions: dict[str, FactDefinition]
    negation_markers: frozenset[str]
    negation_window: int
    #: Words that make a whole clause hedged, so nothing in it is a stated fact.
    hedge_markers: frozenset[str] = frozenset()


@dataclass(frozen=True)
class ConfidenceRules:
    step_down: tuple[tuple[str, str], ...]
    caps: tuple[tuple[str, str, str], ...]
    specialists: dict[str, tuple[str, ...]]
    raw: dict = field(default_factory=dict)


def _load(name: str, rules_dir: Path | None = None) -> dict:
    path = (rules_dir or RULES_DIR) / name
    return yaml.safe_load(path.read_text("utf-8"))


def load_fact_rules(rules_dir: Path | None = None) -> FactRules:
    from app.retrieval.tokenize import fold

    raw = _load("facts.yaml", rules_dir)

    def phrases(values: list[str] | None) -> tuple[tuple[str, ...], ...]:
        return tuple(tuple(fold(word) for word in value.split()) for value in values or ())

    definitions = {
        key: FactDefinition(
            key=key,
            question=body["question"],
            # PyYAML reads a bare `yes`/`no` key as a boolean, so the mapping
            # arrives with True/False keys rather than strings.
            yes_phrases=phrases(body.get(True) or body.get("yes")),
            no_phrases=phrases(body.get(False) or body.get("no")),
        )
        for key, body in raw["facts"].items()
    }
    negations = raw["negations"]
    return FactRules(
        definitions=definitions,
        negation_markers=frozenset(fold(marker) for marker in negations["markers"]),
        negation_window=int(negations["window"]),
        hedge_markers=frozenset(fold(marker) for marker in raw["hedges"]["markers"]),
    )


def load_classification_rules(
    citable_document_ids: frozenset[str],
    rules_dir: Path | None = None,
) -> tuple[list[ClassificationRule], list[str]]:
    """Return the rules in order, and the material fact keys.

    `citable_document_ids` is the set of documents that may be cited *and* have
    passages in the corpus. A rule citing anything outside it is returned
    inactive with the reason, rather than dropped: a rule that quietly vanished
    would look like a product category that does not exist.
    """
    raw = _load("classification_rules.yaml", rules_dir)
    rules: list[ClassificationRule] = []
    for body in raw["rules"]:
        evidence = tuple(body["evidence_source_ids"])
        unbacked = [source_id for source_id in evidence if source_id not in citable_document_ids]
        rules.append(
            ClassificationRule(
                rule_id=body["id"],
                order=int(body["order"]),
                category=ProductClass(body["category"]),
                required_facts=dict(body["required_facts"]),
                evidence_source_ids=evidence,
                changes_if=body["changes_if"],
                active=not unbacked,
                inactive_reason=(
                    None if not unbacked else "no usable source for: " + ", ".join(unbacked)
                ),
            )
        )
    rules.sort(key=lambda rule: rule.order)
    return rules, list(raw["material_facts"])


def load_confidence_rules(rules_dir: Path | None = None) -> ConfidenceRules:
    raw = _load("confidence.yaml", rules_dir)
    return ConfidenceRules(
        step_down=tuple((body["id"], body["reason"]) for body in raw["step_down"]),
        caps=tuple((body["id"], body["at"], body["reason"]) for body in raw["caps"]),
        specialists={key: tuple(value) for key, value in raw["specialists"].items()},
        raw=raw,
    )


@lru_cache(maxsize=1)
def get_fact_rules() -> FactRules:
    return load_fact_rules()


@lru_cache(maxsize=1)
def get_confidence_rules() -> ConfidenceRules:
    return load_confidence_rules()
