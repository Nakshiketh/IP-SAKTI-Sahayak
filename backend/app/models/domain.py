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

from pydantic import BaseModel, ConfigDict, Field


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


class AnswerBlock(DomainModel):
    id: str
    kind: AnswerBlockKind
    text: str
    citation_ids: list[str] = Field(default_factory=list)


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


#: Every model that participates in the frontend contract, in schema order.
CONTRACT_MODELS: tuple[type[DomainModel], ...] = (
    Document,
    Chunk,
    Citation,
    Record,
    AnswerBlock,
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
)
