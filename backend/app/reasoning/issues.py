"""Which legal questions this situation actually raises.

An issue is raised by a stated fact, by the rights and areas the question itself
names, or by the regulatory category the rules reached. It is never raised
because the product is the kind of thing that often has that issue: a trade mark
question does not arise from someone mentioning an Ayurvedic cream, it arises
from them mentioning a brand name.

Everything not raised is reported as `not_indicated` rather than omitted. Silence
would leave a reader to wonder whether their trade mark position had been
considered and found fine, or simply not considered. Those are different, and
only one of them is true.
"""

from __future__ import annotations

from app.models.domain import (
    IPRight,
    IssueFinding,
    IssueStatus,
    IssueType,
    ProductClass,
    RegulatoryArea,
)
from app.reasoning.facts import ExtractedFacts

#: A right named in the question raises its issue directly.
BY_RIGHT: dict[IPRight, IssueType] = {
    IPRight.PATENT: IssueType.PATENT,
    IPRight.TRADEMARK: IssueType.TRADE_MARK,
    IPRight.DESIGN: IssueType.DESIGN,
    IPRight.GEOGRAPHICAL_INDICATION: IssueType.GEOGRAPHICAL_INDICATION,
    IPRight.COPYRIGHT: IssueType.COPYRIGHT,
    IPRight.TRADE_SECRET: IssueType.TRADE_SECRET,
    IPRight.TRADITIONAL_KNOWLEDGE: IssueType.TRADITIONAL_KNOWLEDGE,
}

BY_AREA: dict[RegulatoryArea, IssueType] = {
    RegulatoryArea.LICENSING: IssueType.DRUG_REGULATION,
    RegulatoryArea.MANUFACTURING_GMP: IssueType.DRUG_REGULATION,
    RegulatoryArea.QUALITY_STANDARDS: IssueType.DRUG_REGULATION,
    RegulatoryArea.LABELLING: IssueType.DRUG_REGULATION,
    RegulatoryArea.ADVERTISING: IssueType.DRUG_REGULATION,
    RegulatoryArea.CLINICAL_EVIDENCE: IssueType.DRUG_REGULATION,
    RegulatoryArea.FOOD_NUTRACEUTICAL: IssueType.FOOD_REGULATION,
    RegulatoryArea.ABS_COMPLIANCE: IssueType.BIODIVERSITY_ABS,
}

#: fact key -> (issue, the reason key naming why it was raised)
BY_FACT: dict[str, tuple[IssueType, str]] = {
    "new_process": (IssueType.PATENT, "issueRaisedNewProcess"),
    "classical_text_formulation": (
        IssueType.TRADITIONAL_KNOWLEDGE,
        "issueRaisedClassicalFormulation",
    ),
    "modified_classical_formula": (
        IssueType.TRADITIONAL_KNOWLEDGE,
        "issueRaisedModifiedFormula",
    ),
    "uses_biological_resource": (IssueType.BIODIVERSITY_ABS, "issueRaisedBiologicalResource"),
    "therapeutic_claim": (IssueType.DRUG_REGULATION, "issueRaisedTherapeuticClaim"),
    "food_form": (IssueType.FOOD_REGULATION, "issueRaisedFoodForm"),
    "brand_name": (IssueType.TRADE_MARK, "issueRaisedBrandName"),
    "purified_extract": (IssueType.DRUG_REGULATION, "issueRaisedPurifiedExtract"),
}

#: The category the rules reached raises its own regulator's issue.
BY_CLASS: dict[ProductClass, tuple[IssueType, str]] = {
    ProductClass.CLASSICAL_GENERIC: (IssueType.DRUG_REGULATION, "issueRaisedClassification"),
    ProductClass.PATENT_PROPRIETARY: (IssueType.DRUG_REGULATION, "issueRaisedClassification"),
    ProductClass.NEW_NON_CLASSICAL_DRUG: (IssueType.DRUG_REGULATION, "issueRaisedClassification"),
    ProductClass.PHYTOPHARMACEUTICAL: (IssueType.DRUG_REGULATION, "issueRaisedClassification"),
    ProductClass.AYURVEDA_AAHAR: (IssueType.FOOD_REGULATION, "issueRaisedClassification"),
    ProductClass.COSMETIC: (IssueType.DRUG_REGULATION, "issueRaisedClassification"),
}


def classify_issues(
    facts: ExtractedFacts,
    *,
    ip_rights: tuple[IPRight, ...] = (),
    regulatory_areas: tuple[RegulatoryArea, ...] = (),
    product_class: ProductClass = ProductClass.UNDETERMINED,
) -> list[IssueFinding]:
    raised: dict[IssueType, list[str]] = {}

    def raise_issue(issue: IssueType, reason: str) -> None:
        reasons = raised.setdefault(issue, [])
        if reason not in reasons:
            reasons.append(reason)

    for right in ip_rights:
        if right in BY_RIGHT:
            raise_issue(BY_RIGHT[right], "issueRaisedNamedInQuestion")
    for area in regulatory_areas:
        if area in BY_AREA:
            raise_issue(BY_AREA[area], "issueRaisedNamedInQuestion")

    for key, (issue, reason) in BY_FACT.items():
        # Only a fact stated as true raises an issue. "It makes no therapeutic
        # claim" is a fact, and it raises nothing.
        if facts.value(key) is True:
            raise_issue(issue, reason)

    if product_class is not ProductClass.UNDETERMINED and product_class in BY_CLASS:
        issue, reason = BY_CLASS[product_class]
        raise_issue(issue, reason)

    return [
        IssueFinding(
            issue=issue,
            status=IssueStatus.INDICATED if issue in raised else IssueStatus.NOT_INDICATED,
            reason_keys=raised.get(issue) or ["issueNotIndicatedFromFacts"],
        )
        for issue in IssueType
    ]


def indicated(findings: list[IssueFinding]) -> list[IssueFinding]:
    return [finding for finding in findings if finding.status is IssueStatus.INDICATED]
