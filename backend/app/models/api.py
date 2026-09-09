"""The wire shapes.

Separate from `app.models.domain` on purpose. The domain model is a contract
with the frontend's type definitions, checked for drift against a generated
schema; these are the envelopes around it — what a request carries, what the
stream emits, what the sources endpoint lists. Putting them in the domain module
would put request plumbing into the drift check and make every endpoint change
look like a change to the model.

Field names here match the names the frontend already uses, including the
camelCase ones on the result envelope. The point of Phase 10 is that the
interface does not change when the mock is replaced, and a serialiser alias is a
cheaper way to hold that than a renaming layer in TypeScript.
"""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field

from app.models.domain import (
    AbstainReason,
    Answer,
    Citation,
    Confidence,
    Document,
    IPRight,
    Jurisdiction,
    ProductClass,
    Record,
    RegulatoryArea,
)


class Wire(BaseModel):
    """Serialises by alias, so the JSON reads the way the frontend expects."""

    model_config = ConfigDict(populate_by_name=True, extra="forbid")


# -- query -------------------------------------------------------------------


class QueryFilters(Wire):
    ip_rights: list[IPRight] = Field(default_factory=list)
    regulatory_areas: list[RegulatoryArea] = Field(default_factory=list)
    document_types: list[str] = Field(default_factory=list)


class QueryBody(Wire):
    text: str
    jurisdiction: Jurisdiction = Jurisdiction.IN
    #: Which market an international question is about. Recorded and echoed;
    #: it narrows nothing until the corpus has more than one market in it.
    market: str | None = None
    language_in: str | None = None
    language_out: str | None = None
    product_class: ProductClass = ProductClass.UNDETERMINED
    filters: QueryFilters | None = None
    session_id: str = "anonymous"


class WirePassage(Wire):
    citation_id: str
    document_id: str
    retrieval_score: float
    rerank_score: float
    within_effective_window: bool


class WireEvidence(Wire):
    jurisdiction: Jurisdiction
    passages: list[WirePassage] = Field(default_factory=list)
    contradictions: list[tuple[str, str]] = Field(default_factory=list)
    out_of_scope: bool = False
    needs_more_facts: bool = False


class WireConfidence(Wire):
    level: Confidence
    reason_key: str = Field(serialization_alias="reasonKey")
    reason_vars: dict[str, int] = Field(serialization_alias="reasonVars")
    abstain_reason: AbstainReason | None = Field(default=None, serialization_alias="abstainReason")


class WireStage(Wire):
    id: str
    ms: int


class WireDetection(Wire):
    language: str
    confidence: float
    ambiguous_with: list[str] = Field(default_factory=list, serialization_alias="ambiguousWith")
    decided: bool


class WireRoute(Wire):
    """Where the question was answered, and whether the reader chose it.

    ``inferred`` is true when the question named a jurisdiction the toggle did
    not. The interface says so rather than silently answering somewhere else.
    """

    jurisdiction: Jurisdiction
    inferred: bool
    marker: str | None = None


class WireTranslation(Wire):
    engine: str
    translated: bool


class WireQueryResult(Wire):
    #: Identifies this run. Feedback and escalation refer back to it, and it is
    #: the key the audit row is written under.
    query_id: str = Field(serialization_alias="queryId")
    question: str
    jurisdiction: Jurisdiction
    evidence: WireEvidence
    confidence: WireConfidence
    #: Null when the system abstained. There is no partial answer.
    answer: Answer | None = None
    related_records: list[Record] = Field(
        default_factory=list, serialization_alias="relatedRecords"
    )
    follow_ups: list[str] = Field(default_factory=list, serialization_alias="followUps")
    stages: list[WireStage] = Field(default_factory=list)
    total_ms: int = Field(serialization_alias="totalMs")
    documents_searched: int = Field(serialization_alias="documentsSearched")
    #: Every passage that was considered, as a citation, keyed by citation id.
    #: An abstention has no answer to read its sources off, and the surface that
    #: shows a conflict has to be able to name both sides of it.
    sources: dict[str, Citation] = Field(default_factory=dict)
    #: The text of each of those passages, keyed the same way, for the reveal.
    passages: dict[str, str] = Field(default_factory=dict)
    language: WireDetection
    route: WireRoute
    corpus_version: str = Field(serialization_alias="corpusVersion")
    is_demo: bool = Field(serialization_alias="isDemo")
    translation: WireTranslation
    #: Set when the product declined the question rather than failing to answer.
    refusal: str | None = None


# -- classification ----------------------------------------------------------


class ClassifyBody(Wire):
    #: Answers to the graph's questions, keyed by question id.
    answers: dict[str, str] = Field(default_factory=dict)


class ClassifyResult(Wire):
    #: Questions asked, in order, so the interface can show the path taken.
    asked: list[str] = Field(default_factory=list)
    #: The next question, or null when an outcome has been reached.
    next: str | None = None
    outcome_id: str | None = Field(default=None, serialization_alias="outcomeId")
    #: More than one class is a real answer: some paths leave two routes open.
    classes: list[ProductClass] = Field(default_factory=list)
    questions_remaining_at_most: int = Field(serialization_alias="questionsRemainingAtMost")


# -- access and benefit sharing ----------------------------------------------


class AbsBody(Wire):
    answers: dict[str, str] = Field(default_factory=dict)


class AbsResult(Wire):
    """Orientation, never a determination. Every field says what it is."""

    engaged: bool
    #: Keys into the interface's own copy. This endpoint states no legal
    #: consequence; it says which orientation panel applies.
    panels: list[str] = Field(default_factory=list)
    #: Documents the panels will rest on once the corpus is ingested.
    pending_sources: list[str] = Field(default_factory=list, serialization_alias="pendingSources")
    next_question: str | None = Field(default=None, serialization_alias="nextQuestion")


# -- sources -----------------------------------------------------------------


class SourceSummary(Wire):
    document_id: str
    title: str
    short_title: str | None = None
    organization: str
    jurisdiction: Jurisdiction
    regime_family: str
    document_type: str
    group: str
    source_url: str | None = None
    effective_from: str | None = None
    retrieved_at: str | None = None
    verification_status: str


class SourcesResult(Wire):
    corpus_version: str = Field(serialization_alias="corpusVersion")
    group_order: list[str] = Field(default_factory=list, serialization_alias="groupOrder")
    documents: list[SourceSummary] = Field(default_factory=list)
    #: How many of them the ingestion pipeline has actually fetched.
    fetched_count: int = Field(serialization_alias="fetchedCount")


class SourceDetail(Wire):
    document: Document
    #: Passages indexed from this document. Zero until ingestion has run.
    chunk_count: int = Field(serialization_alias="chunkCount")


# -- records -----------------------------------------------------------------


class RecordsSearchResult(Wire):
    records: list[Record] = Field(default_factory=list)
    total: int
    #: How many records exist at all, so an empty result can say which it is:
    #: nothing matched, or nothing has been ingested.
    record_count: int = Field(serialization_alias="recordCount")
    ingested: bool
    note: str


class RecordDetail(Wire):
    record: Record
    source_name: str = Field(serialization_alias="sourceName")
    publisher: str | None = None
    #: Rendered verbatim wherever the record is shown. Open data licences
    #: typically require exactly this.
    attribution_text: str | None = Field(default=None, serialization_alias="attributionText")
    licence: str | None = None
    note: str


class AggregateRow(Wire):
    source_id: str = Field(serialization_alias="sourceId")
    dimension: str
    period: str
    measure: str
    value: float
    #: Restated per row rather than documented once. A client rendering one of
    #: these as a citation has to ignore a field to do it.
    citable_in_answers: bool = Field(default=False, serialization_alias="citableInAnswers")


class LandscapeResult(Wire):
    rows: list[AggregateRow] = Field(default_factory=list)
    note: str


class RecordsSourceRow(Wire):
    source_id: str = Field(serialization_alias="sourceId")
    name: str
    publisher: str
    jurisdiction: str
    record_type: str = Field(serialization_alias="recordType")
    access_mode: str = Field(serialization_alias="accessMode")
    licence: str | None = None
    licence_url: str | None = Field(default=None, serialization_alias="licenceUrl")
    attribution_text: str | None = Field(default=None, serialization_alias="attributionText")
    terms_note: str = Field(default="", serialization_alias="termsNote")
    citable_in_answers: bool = Field(default=False, serialization_alias="citableInAnswers")
    ingested: bool = False
    record_count: int = Field(default=0, serialization_alias="recordCount")
    last_snapshot_at: str | None = Field(default=None, serialization_alias="lastSnapshotAt")
    link_template_verified: bool = Field(default=False, serialization_alias="linkTemplateVerified")


class PortalLinkRow(Wire):
    """A registry this product does not search, and says it does not search."""

    source_id: str = Field(serialization_alias="sourceId")
    name: str
    publisher: str
    jurisdiction: str
    record_type: str = Field(serialization_alias="recordType")
    #: Null until somebody has verified this portal's URL structure. A deep link
    #: written from memory would look like a search that found nothing.
    url: str | None = None
    terms_note: str = Field(default="", serialization_alias="termsNote")
    #: Always true, and sent so the interface never has to infer it.
    not_searched_here: bool = Field(default=True, serialization_alias="notSearchedHere")


class RecordsSourcesResult(Wire):
    records_version: str = Field(serialization_alias="recordsVersion")
    sources: list[RecordsSourceRow] = Field(default_factory=list)
    portals: list[PortalLinkRow] = Field(default_factory=list)
    record_count: int = Field(serialization_alias="recordCount")
    portal_count: int = Field(serialization_alias="portalCount")
    ingestible_count: int = Field(serialization_alias="ingestibleCount")


# -- feedback and escalation -------------------------------------------------


class FeedbackBody(Wire):
    session_id: str = "anonymous"
    query_id: str | None = None
    #: "helpful" | "not_helpful" | "wrong_source" | "wrong_jurisdiction"
    verdict: str
    #: Free text is accepted and deliberately not stored. See the endpoint.
    note: str | None = None


class EscalateBody(Wire):
    session_id: str = "anonymous"
    query_id: str | None = None
    jurisdiction: Jurisdiction = Jurisdiction.IN
    product_class: ProductClass = ProductClass.UNDETERMINED


# -- consent and the access log ----------------------------------------------


class ConsentBody(Wire):
    session_id: str = "anonymous"
    #: The manifest id of the source this decision is about. Consent is never
    #: global: a reader agrees to one named source at a time.
    source_id: str
    granted: bool = True


class ConsentEventRow(Wire):
    source_id: str = Field(serialization_alias="sourceId")
    source_name: str = Field(serialization_alias="sourceName")
    granted: bool
    recorded_at: str = Field(serialization_alias="recordedAt")


class AccessLogResult(Wire):
    """What this session has agreed to, and when."""

    events: list[ConsentEventRow] = Field(default_factory=list)
    #: Source ids currently allowed — the latest decision for each.
    granted: list[str] = Field(default_factory=list)
    #: Sources in the manifest that would need consent at all. Empty today, and
    #: the interface says so rather than implying a gate nobody has met.
    credentialed_sources: list[SourceSummary] = Field(
        default_factory=list, serialization_alias="credentialedSources"
    )


class AuditRowResult(Wire):
    """One audit row, for the development viewer. Never served in production."""

    id: int
    recorded_at: str = Field(serialization_alias="recordedAt")
    event: str
    session_id: str = Field(serialization_alias="sessionId")
    query_id: str | None = None
    question_hash: str | None = Field(default=None, serialization_alias="questionHash")
    jurisdiction: str | None = None
    passage_ids: list[str] = Field(default_factory=list, serialization_alias="passageIds")
    model: str | None = None
    prompt_version: str | None = Field(default=None, serialization_alias="promptVersion")
    corpus_version: str | None = Field(default=None, serialization_alias="corpusVersion")
    confidence: str | None = None
    abstained: bool | None = None
    abstain_reason: str | None = Field(default=None, serialization_alias="abstainReason")
    neutralised_spans: int = Field(default=0, serialization_alias="neutralisedSpans")
    dropped_claims: int = Field(default=0, serialization_alias="droppedClaims")
    latency_ms: int | None = Field(default=None, serialization_alias="latencyMs")
    detail: dict | None = None


class AuditResult(Wire):
    rows: list[AuditRowResult] = Field(default_factory=list)
    #: The columns the table has, so the viewer can state what is *not* held
    #: from the schema rather than from a hard-coded list that could drift.
    columns: list[str] = Field(default_factory=list)


class Acknowledgement(Wire):
    """What was recorded, stated plainly rather than as a success message."""

    recorded: bool
    #: What the product will do next. There is no queue behind escalation, and
    #: this field is what stops the interface implying there is one.
    note: str
