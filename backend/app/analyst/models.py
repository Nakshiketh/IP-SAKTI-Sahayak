"""The shapes the analyst reads, stores and returns.

Findings and judgements are separate fields. A `Reason` carries `basis`: "evidence"
when it restates something retrieved, "interpretation" when it is this product's
reading of that evidence. The interface renders the two differently.
"""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field

Level = Literal["high", "moderate", "low"]
Indicator = Literal["potentially_novel", "further_assessment", "high_similarity"]


class Amount(BaseModel):
    value: float
    unit: str


class Ingredient(BaseModel):
    #: Vocabulary id, or "custom:<folded name>" for a name the vocabulary lacks.
    key: str
    name: str
    vocabulary_id: str | None = None
    label: str | None = None
    kind: Literal["traditional", "material", "excipient", "unrecognised"] = "unrecognised"
    amount: Amount | None = None
    percent: float | None = None
    #: Computed from masses when every ingredient has one; never shown as stated.
    percent_derived: float | None = None
    purpose: str | None = None

    @property
    def effective_percent(self) -> float | None:
        return self.percent if self.percent is not None else self.percent_derived

    @property
    def has_quantity(self) -> bool:
        return self.percent is not None or self.amount is not None


class Invention(BaseModel):
    title: str | None = None
    invention_type: str | None = None
    form: str | None = None
    category: str | None = None
    intended_use: str | None = None
    use_terms: list[str] = Field(default_factory=list)
    problem: str | None = None
    ingredients: list[Ingredient] = Field(default_factory=list)
    batch_size: Amount | None = None
    process_steps: list[str] = Field(default_factory=list)
    process_parameters: list[str] = Field(default_factory=list)
    distinctive_features: list[str] = Field(default_factory=list)
    technical_effects: list[str] = Field(default_factory=list)
    evidence: str | None = None
    disclosure: Literal["public", "confidential"] | None = None
    brand_name: str | None = None
    packaging_note: str | None = None
    region_note: str | None = None
    version: int = 0


class DialogueState(BaseModel):
    asked: list[str] = Field(default_factory=list)
    declined: list[str] = Field(default_factory=list)
    last_asked: str | None = None
    #: Stage id -> fingerprint of the inputs it last ran on.
    fingerprints: dict[str, str] = Field(default_factory=dict)


class Reason(BaseModel):
    code: str
    params: dict[str, Any] = Field(default_factory=dict)
    basis: Literal["evidence", "interpretation"] = "interpretation"


# -- products ------------------------------------------------------------------


class Source(BaseModel):
    url: str
    publisher: str
    kind: str
    retrieved_at: str
    excerpt: str


class ComparisonRow(BaseModel):
    key: str
    label: str
    status: Literal["common", "added", "removed"]
    user_name: str | None = None
    user_percent: float | None = None
    user_amount: str | None = None
    product_name: str | None = None
    product_percent: float | None = None
    product_amount: str | None = None
    difference: Literal["higher", "lower", "same", "unknown"] | None = None


class ProductMatch(BaseModel):
    product_id: str
    name: str
    brand: str | None
    manufacturer: str | None
    product_form: str
    stated_use: list[str]
    ingredient_list_scope: str
    level: Level
    shared: list[str]
    shared_count: int
    user_count: int
    product_active_count: int
    base_ingredients: list[str]
    same_form: bool
    shared_uses: list[str]
    rows: list[ComparisonRow]
    notes: list[Reason]
    sources: list[Source]


class ProductsFinding(BaseModel):
    state: Literal["searched", "unavailable"]
    dataset_size: int
    dataset_version: str
    retrieved_at: str
    matches: list[ProductMatch]
    weaker: list[ProductMatch]


# -- traditional knowledge -----------------------------------------------------


class KnowledgeIngredient(BaseModel):
    key: str
    name: str
    label: str | None
    recognised: Literal["traditional", "material", "unrecognised"]


class ClassicalHit(BaseModel):
    id: str
    label: str
    via: Literal["name", "ingredients"]


class KnowledgeFinding(BaseModel):
    reference_size: int
    formulation_count: int
    ingredients: list[KnowledgeIngredient]
    traditional_count: int
    classical: list[ClassicalHit]
    tkdl_searched: Literal[False] = False
    notes: list[Reason]


# -- prior art -----------------------------------------------------------------


class PatentMatch(BaseModel):
    record_id: str
    title: str
    record_type: str
    jurisdiction: str
    applicant: str | None
    filing_date: str | None
    publication_date: str | None
    status: str | None
    abstract: str | None
    level: Level
    matched_ingredients: list[str]
    matched_uses: list[str]
    why: list[Reason]
    citable_in_answers: Literal[False] = False


class Registry(BaseModel):
    name: str
    publisher: str
    jurisdiction: str
    record_type: str


class PriorArtFinding(BaseModel):
    state: Literal["searched", "not_loaded", "failed"]
    record_count: int
    searched_terms: list[str]
    matches: list[PatentMatch]
    registries_not_searched: list[Registry]


# -- assessment ----------------------------------------------------------------


class RequirementView(BaseModel):
    status: str
    reasons: list[Reason]


class Assessment(BaseModel):
    indicator: Indicator
    reasons: list[Reason]
    novelty: RequirementView
    inventive_step: RequirementView
    industrial_applicability: RequirementView
    exclusions: list[Reason]
    would_sharpen: list[str]


class IpOption(BaseModel):
    type: Literal["patent", "trademark", "design", "copyright", "gi", "trade_secret"]
    relevance: Literal["relevant", "possible", "not_indicated"]
    reasons: list[Reason]


class Analysis(BaseModel):
    created_at: float
    invention_version: int
    trigger: str
    reran: list[str]
    products: ProductsFinding
    knowledge: KnowledgeFinding
    prior_art: PriorArtFinding
    assessment: Assessment
    ip_options: list[IpOption]
    next_steps: list[Reason]


# -- conversation --------------------------------------------------------------


class Message(BaseModel):
    id: int
    role: Literal["user", "assistant"]
    text: str
    created_at: float
    meta: dict[str, Any] = Field(default_factory=dict)


class RunSummary(BaseModel):
    id: int
    created_at: float
    trigger: str
    indicator: Indicator
    product_matches: int
    patent_matches: int


class ConversationSummary(BaseModel):
    id: str
    title: str
    created_at: float
    updated_at: float
    indicator: Indicator | None
    ingredient_count: int


class Conversation(BaseModel):
    id: str
    title: str
    created_at: float
    updated_at: float
    invention: Invention
    messages: list[Message]
    analysis: Analysis | None
    missing: list[str]
    ready: bool
    history: list[RunSummary]
    engine: Literal["rules", "model"] = "rules"
