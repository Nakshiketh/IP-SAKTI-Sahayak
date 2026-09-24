"""Domain model for IP-SAKTI Sahayak.

This module is one half of a contract. The other half is
``frontend/src/types/domain.ts``. Both are checked against
``schemas/domain.schema.json``, which is generated from *this* file by
``scripts/gen_schema.py``. If the two halves drift, the tests fail.

Two rules encoded here rather than left to convention:

* ``Record`` carries ``citable_in_answers`` pinned to ``False``. Registry data is
  evidence of what was filed or granted, never a statement of law.
* ``Answer`` carries jurisdiction as a single value. India and International are
  separate retrieval namespaces and separate answer surfaces; a cross-border
  question produces two ``Answer`` objects, never one blended one.
"""

from __future__ import annotations

from datetime import date, datetime
from enum import Enum, StrEnum
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


class Jurisdiction(StrEnum):
    IN = "IN"
    INTL = "INTL"


class IPRight(StrEnum):
    PATENT = "patent"
    TRADEMARK = "trademark"
    GEOGRAPHICAL_INDICATION = "geographical_indication"
    COPYRIGHT = "copyright"
    DESIGN = "design"
    PLANT_VARIETY = "plant_variety"
    TRADE_SECRET = "trade_secret"
    TRADITIONAL_KNOWLEDGE = "traditional_knowledge"


class RegulatoryArea(StrEnum):
    LICENSING = "licensing"
    MANUFACTURING_GMP = "manufacturing_gmp"
    QUALITY_STANDARDS = "quality_standards"
    LABELLING = "labelling"
    ADVERTISING = "advertising"
    FOOD_NUTRACEUTICAL = "food_nutraceutical"
    COSMETIC = "cosmetic"
    CLINICAL_EVIDENCE = "clinical_evidence"
    IMPORT_EXPORT = "import_export"
    ABS_COMPLIANCE = "abs_compliance"


class ProductClass(StrEnum):
    CLASSICAL_GENERIC = "classical_generic"
    PATENT_PROPRIETARY = "patent_proprietary"
    NEW_NON_CLASSICAL_DRUG = "new_non_classical_drug"
    PHYTOPHARMACEUTICAL = "phytopharmaceutical"
    AYURVEDA_AAHAR = "ayurveda_aahar"
    COSMETIC = "cosmetic"
    UNDETERMINED = "undetermined"


class Confidence(StrEnum):
    HIGH = "high"
    MODERATE = "moderate"
    LOW = "low"
    ABSTAIN = "abstain"


class DocumentType(StrEnum):
    ACT = "act"
    RULES = "rules"
    REGULATION = "regulation"
    TREATY = "treaty"
    GUIDELINE = "guideline"
    PHARMACOPOEIA = "pharmacopoeia"
    CASE_LAW = "case_law"
    FORM = "form"
    NOTIFICATION = "notification"


class VerificationStatus(StrEnum):
    VERIFIED = "verified"
    UNVERIFIED = "unverified"
    DEMO = "demo"


class RecordType(StrEnum):
    PATENT_APPLICATION = "patent_application"
    PATENT_GRANT = "patent_grant"
    GI_REGISTRATION = "gi_registration"
    TRADEMARK = "trademark"
    DESIGN = "design"
    PLANT_VARIETY = "plant_variety"
    ABS_APPROVAL = "abs_approval"
    AGGREGATE_STATISTIC = "aggregate_statistic"


class AnswerBlockKind(StrEnum):
    ANSWER = "answer"
    WHY = "why"
    WHAT_TO_CHECK = "what_to_check"
    CAVEAT = "caveat"


class AbstainReason(StrEnum):
    """Why the system declined. Distinct states, not one error."""

    NOTHING_RELEVANT = "nothing_relevant"
    OUT_OF_SCOPE = "out_of_scope"
    SOURCES_CONFLICT = "sources_conflict"
    SOURCES_OUT_OF_DATE = "sources_out_of_date"
    NEEDS_MORE_FACTS = "needs_more_facts"
    #: The question was in a language the corpus could not be searched in, and
    #: no translator was available to pivot it.
    LANGUAGE_UNSUPPORTED = "language_unsupported"


class AbstainCode(StrEnum):
    """The nine states the product can decline in, each with its own redirect.

    `AbstainReason` above is the older, coarser set that the answer-level
    confidence rule produces and the TypeScript mirror is pinned to. This is the
    taxonomy the reasoning stage works in; `abstain_code_for` maps the old
    reasons and the guardrail refusals onto it, so both surfaces agree without
    the older rule having to change.
    """

    #: Nothing usable was retrieved, or every usable source was dropped.
    INSUFFICIENT_AUTHORITATIVE_EVIDENCE = "insufficient_authoritative_evidence"
    #: The answer turns on a fact the reader has not given.
    MISSING_MATERIAL_FACTS = "missing_material_facts"
    #: The question reaches a legal system this product does not hold sources for.
    UNSUPPORTED_JURISDICTION = "unsupported_jurisdiction"
    #: Two sources of equal authority say different things and neither governs.
    CONFLICTING_AUTHORITATIVE_SOURCES = "conflicting_authoritative_sources"
    #: The governing source may have been amended, or its provenance is unconfirmed.
    SOURCE_STATUS_UNCERTAIN = "source_status_uncertain"
    #: Answering would require applying a provision to facts, which is advice.
    PROFESSIONAL_INTERPRETATION_REQUIRED = "professional_interpretation_required"
    #: "Will my patent be granted?", "is this novel?", "am I infringing?"
    REQUEST_FOR_LEGAL_VERDICT = "request_for_legal_verdict"
    #: Dosage, treatment, diagnosis: a question for a clinician, not this product.
    OUT_OF_SCOPE_CLINICAL_QUERY = "out_of_scope_clinical_query"
    #: Outside intellectual property and the regulation of these products.
    OUT_OF_SCOPE_NON_IP = "out_of_scope_non_ip"


class IssueType(StrEnum):
    """A distinct legal question a single product can raise.

    Separate from `IPRight` on purpose: an issue is something to be reasoned
    about and given its own confidence, while a right is a thing you hold. One
    product can raise the patent issue and the biodiversity issue at once, and
    the answer can be well supported on one and thin on the other.
    """

    PATENT = "patent"
    TRADITIONAL_KNOWLEDGE = "traditional_knowledge"
    BIODIVERSITY_ABS = "biodiversity_abs"
    DRUG_REGULATION = "drug_regulation"
    FOOD_REGULATION = "food_regulation"
    TRADE_MARK = "trade_mark"
    DESIGN = "design"
    GEOGRAPHICAL_INDICATION = "geographical_indication"
    COPYRIGHT = "copyright"
    TRADE_SECRET = "trade_secret"


class IssueStatus(StrEnum):
    #: The stated facts raise this issue.
    INDICATED = "indicated"
    #: The facts do not raise it. Said plainly rather than left out, because
    #: "we did not consider trade marks" and "trade marks do not arise here"
    #: are different things to tell someone.
    NOT_INDICATED = "not_indicated"


class ConflictType(StrEnum):
    #: The same issue answered differently by two legal systems.
    JURISDICTIONAL = "jurisdictional"
    #: Two different legal questions about one product, read as if they clashed.
    SCOPE_OVERLAP = "scope_overlap"
    #: The same point stated by sources of different authority.
    AUTHORITY = "authority"
    #: One source supersedes the other, or their effective dates do not overlap.
    TEMPORAL = "temporal"
    #: Two classification rules are both satisfied.
    CLASSIFICATION = "classification"
    #: The sources diverge on a fact the reader has not given.
    MISSING_FACT = "missing_fact"
    #: Same authority level, same jurisdiction, same date, and still contradictory.
    TRUE_SOURCE_CONFLICT = "true_source_conflict"


class ResolutionStatus(StrEnum):
    #: Both apply; they are not in conflict, they are different obligations.
    SEPARATE_OBLIGATIONS = "separate_obligations"
    #: The higher authority governs.
    RESOLVED_BY_AUTHORITY = "resolved_by_authority"
    #: The later instrument governs.
    RESOLVED_BY_DATE = "resolved_by_date"
    #: Nothing in the sources settles it.
    UNRESOLVED = "unresolved"


class ApplicabilityStatus(StrEnum):
    APPLIES = "applies"
    MAY_APPLY = "may_apply"
    NOT_INDICATED = "not_indicated"


class EscalationLevel(StrEnum):
    """How much human help this answer needs. L0 none, L3 a professional now."""

    L0 = "l0"
    L1 = "l1"
    L2 = "l2"
    L3 = "l3"


class DomainModel(BaseModel):
    """Base: reject unknown fields so drift surfaces at the boundary."""

    model_config = ConfigDict(extra="forbid", use_enum_values=False)


class Document(DomainModel):
    """A Layer 1 source. Normative. Citable as authority."""

    document_id: str
    title: str
    short_title: str | None = None
    organization: str
    jurisdiction: Jurisdiction
    regime_family: str
    document_type: DocumentType
    language: str = "en"
    source_url: str | None = None
    version_label: str | None = None
    effective_from: date | None = None
    effective_to: date | None = None
    supersedes: list[str] = Field(default_factory=list)
    superseded_by: str | None = None
    publication_date: date | None = None
    retrieved_at: datetime | None = None
    verification_status: VerificationStatus = VerificationStatus.UNVERIFIED
    checksum: str | None = None


class Chunk(DomainModel):
    """A section-aware passage. ``section_path`` is what makes a citation precise."""

    chunk_id: str
    document_id: str
    text: str
    section_path: list[str] = Field(default_factory=list)
    page_from: int | None = None
    page_to: int | None = None
    heading: str | None = None
    token_count: int | None = None
    embedding_ref: str | None = None
    jurisdiction: Jurisdiction
    ip_rights: list[IPRight] = Field(default_factory=list)
    regulatory_areas: list[RegulatoryArea] = Field(default_factory=list)
    product_classes: list[ProductClass] = Field(default_factory=list)
    effective_from: date | None = None
    effective_to: date | None = None


class Citation(DomainModel):
    """What a claim points at. Rendered claim-level, never as a footer."""

    citation_id: str
    chunk_id: str
    document_id: str
    document_title: str
    organization: str
    jurisdiction: Jurisdiction
    section_label: str | None = None
    page: int | None = None
    url: str | None = None
    retrieval_score: float | None = None
    rerank_score: float | None = None
    verification_status: VerificationStatus = VerificationStatus.UNVERIFIED
    as_of_date: date | None = None
    #: How far the registry has checked this source: "verified_official",
    #: "human_reviewed", or null when the registry holds no record for it.
    review_state: str | None = None
    #: When a person last confirmed it against the official original.
    reviewed_at: date | None = None
    #: True when the source is cited only because it is known to be official
    #: but could not be re-fetched. The interface says so, and it caps
    #: confidence for the answer.
    provenance_pending: bool = False


class Record(DomainModel):
    """Layer 2 — evidential, never authority.

    ``citable_in_answers`` is pinned false at the schema level so no code path can
    promote a filed or granted record into a citation.
    """

    record_id: str
    source_id: str
    jurisdiction: Jurisdiction
    record_type: RecordType
    title: str
    applicant: str | None = None
    inventor_or_proprietor: str | None = None
    filing_date: date | None = None
    publication_date: date | None = None
    grant_or_registration_date: date | None = None
    status: str | None = None
    classification_codes: list[str] = Field(default_factory=list)
    goods_or_field: str | None = None
    abstract_text: str | None = None
    snapshot_at: datetime | None = None
    citable_in_answers: Literal[False] = False


class Claim(DomainModel):
    """One sentence, and the passages that support it — or none.

    Citation is claim-level, not answer-level: a reader has to be able to see
    which sentence rests on which passage, and which sentence rests on nothing.
    A claim with an empty ``citation_ids`` renders as general explanation and is
    marked as such, never silently mixed in with sourced text.
    """

    text: str
    citation_ids: list[str] = Field(default_factory=list)


class AnswerBlock(DomainModel):
    id: str
    kind: AnswerBlockKind
    text: str
    citation_ids: list[str] = Field(default_factory=list)
    claims: list[Claim] = Field(default_factory=list)

    @model_validator(mode="after")
    def _text_matches_claims(self) -> AnswerBlock:
        """``text`` is the flat rendering of ``claims``; they cannot disagree.

        ``text`` is what a copy-to-clipboard produces and what an evaluator
        scores. Letting it drift from the claims would mean the scored text and
        the cited text were different things.
        """
        if not self.claims:
            return self
        joined = " ".join(claim.text.strip() for claim in self.claims).strip()
        if joined != self.text.strip():
            raise ValueError(
                "AnswerBlock.text must be the claims joined by a space; "
                f"got {self.text!r}, expected {joined!r}"
            )
        return self

    @model_validator(mode="after")
    def _citation_ids_cover_claims(self) -> AnswerBlock:
        """The block's ids are the union of its claims' ids."""
        if not self.claims:
            return self
        from_claims = {cid for claim in self.claims for cid in claim.citation_ids}
        if from_claims != set(self.citation_ids):
            raise ValueError(
                "AnswerBlock.citation_ids must be the union of its claims' citation_ids"
            )
        return self


class Fact(DomainModel):
    """Something the reader stated about their own situation.

    `span` is the words they used. Keeping it means a fact can always be traced
    back to the sentence it came from, so a reader who disagrees can see exactly
    what was read into their question.
    """

    key: str
    value: bool
    span: str


class MissingFact(DomainModel):
    """A fact a rule needed and the question did not give.

    Reported rather than assumed. An assumed fact is the cheapest way to produce
    a confident answer to a question nobody asked.
    """

    key: str
    question: str


class IssueFinding(DomainModel):
    issue: IssueType
    status: IssueStatus
    #: Keys the interface renders: why this issue was or was not raised.
    reason_keys: list[str] = Field(default_factory=list)
    citation_ids: list[str] = Field(default_factory=list)
    confidence: Confidence | None = None
    confidence_reason_keys: list[str] = Field(default_factory=list)
    missing_facts: list[MissingFact] = Field(default_factory=list)


class Conflict(DomainModel):
    """Two sources that do not sit together, and what the rules make of it.

    Detected from metadata the registry and the corpus hold — authority level,
    supersession, effective dates, jurisdiction — never by comparing the wording
    of two passages. Comparing wording would mean guessing, and a guessed
    conflict is worse than a missed one: it tells a reader that the law is
    unsettled when it may not be.
    """

    conflict_id: str
    conflict_type: ConflictType
    issue: IssueType | None = None
    source_a: str
    source_b: str
    #: Which of the two governs, where the rules settle it.
    governing_source: str | None = None
    #: A reason key, not prose: it is rendered in the reader's language.
    explanation_key: str
    resolution_status: ResolutionStatus
    #: What the resolution rests on, e.g. "authority_level", "superseded_by".
    reasoning_basis: str
    requires_human_review: bool = False


class ProvisionApplicability(DomainModel):
    citation_id: str
    status: ApplicabilityStatus
    #: Facts that would settle a `may_apply`.
    needs_facts: list[str] = Field(default_factory=list)


class Escalation(DomainModel):
    level: EscalationLevel
    reason_keys: list[str] = Field(default_factory=list)
    #: Types of specialist, never named people or firms.
    specialists: list[str] = Field(default_factory=list)


class Analysis(DomainModel):
    """What the reasoning stage concluded, beside the answer it produced.

    Carried on the Answer rather than replacing any of it: the prose is still
    composed from cited passages, and this says what the product worked out on
    the way there — which issues arose, what it could not settle, and how sure
    it is issue by issue.
    """

    facts: list[Fact] = Field(default_factory=list)
    missing_facts: list[MissingFact] = Field(default_factory=list)
    product_class: ProductClass = ProductClass.UNDETERMINED
    #: Other categories whose rules were also satisfied.
    alternative_classes: list[ProductClass] = Field(default_factory=list)
    classification_rule_id: str | None = None
    #: What would move the product out of the chosen category.
    changes_if: str | None = None
    issues: list[IssueFinding] = Field(default_factory=list)
    conflicts: list[Conflict] = Field(default_factory=list)
    applicability: list[ProvisionApplicability] = Field(default_factory=list)
    escalation: Escalation | None = None
    abstain_code: AbstainCode | None = None
    #: Jurisdictions named in the question that this product holds no sources for.
    unsupported_jurisdictions: list[str] = Field(default_factory=list)


class Answer(DomainModel):
    """One answer, for one jurisdiction. Never merged across jurisdictions."""

    answer_id: str
    query_id: str
    jurisdiction: Jurisdiction
    language: str = "en"
    product_class: ProductClass = ProductClass.UNDETERMINED
    ip_rights: list[IPRight] = Field(default_factory=list)
    regulatory_areas: list[RegulatoryArea] = Field(default_factory=list)
    blocks: list[AnswerBlock] = Field(default_factory=list)
    citations: list[Citation] = Field(default_factory=list)
    related_records: list[Record] = Field(default_factory=list)
    confidence: Confidence
    abstained: bool = False
    abstain_reason: AbstainReason | None = None
    escalation_offered: bool = True
    as_of_date: date | None = None
    corpus_version: str | None = None
    latency_ms: int | None = None
    is_demo: bool = False
    #: What the reasoning stage worked out on the way to this answer.
    analysis: Analysis | None = None


#: Every model that participates in the frontend contract, in schema order.
CONTRACT_MODELS: tuple[type[DomainModel], ...] = (
    Document,
    Chunk,
    Citation,
    Record,
    Claim,
    AnswerBlock,
    Fact,
    MissingFact,
    IssueFinding,
    Conflict,
    ProvisionApplicability,
    Escalation,
    Analysis,
    Answer,
)

#: Every enum that participates in the frontend contract.
CONTRACT_ENUMS: tuple[type[Enum], ...] = (
    Jurisdiction,
    IPRight,
    RegulatoryArea,
    ProductClass,
    Confidence,
    DocumentType,
    VerificationStatus,
    RecordType,
    AnswerBlockKind,
    AbstainReason,
    AbstainCode,
    IssueType,
    IssueStatus,
    ConflictType,
    ResolutionStatus,
    ApplicabilityStatus,
    EscalationLevel,
)
