/**
 * Domain model — the TypeScript half of the contract.
 *
 * The Python half is `backend/app/models/domain.py`. Both are checked against
 * `schemas/domain.schema.json`, which is generated from the Python side. The
 * unions and field lists below are *derived from* the runtime constants in this
 * file, and `domain.test.ts` asserts those constants equal the schema. So a
 * change on either side that is not mirrored on the other fails a test rather
 * than reaching a user as a silently missing field.
 *
 * When the schema changes: run `python scripts/gen_schema.py`, then update the
 * constants here until `npm test` passes.
 */

// ---------------------------------------------------------------------------
// Enumerations
// ---------------------------------------------------------------------------

export const JURISDICTIONS = ['IN', 'INTL'] as const;
export type Jurisdiction = (typeof JURISDICTIONS)[number];

export const IP_RIGHTS = [
  'patent',
  'trademark',
  'geographical_indication',
  'copyright',
  'design',
  'plant_variety',
  'trade_secret',
  'traditional_knowledge',
] as const;
export type IPRight = (typeof IP_RIGHTS)[number];

export const REGULATORY_AREAS = [
  'licensing',
  'manufacturing_gmp',
  'quality_standards',
  'labelling',
  'advertising',
  'food_nutraceutical',
  'cosmetic',
  'clinical_evidence',
  'import_export',
  'abs_compliance',
] as const;
export type RegulatoryArea = (typeof REGULATORY_AREAS)[number];

export const PRODUCT_CLASSES = [
  'classical_generic',
  'patent_proprietary',
  'new_non_classical_drug',
  'phytopharmaceutical',
  'ayurveda_aahar',
  'cosmetic',
  'undetermined',
] as const;
export type ProductClass = (typeof PRODUCT_CLASSES)[number];

export const CONFIDENCE_LEVELS = ['high', 'moderate', 'low', 'abstain'] as const;
export type Confidence = (typeof CONFIDENCE_LEVELS)[number];

export const DOCUMENT_TYPES = [
  'act',
  'rules',
  'regulation',
  'treaty',
  'guideline',
  'pharmacopoeia',
  'case_law',
  'form',
  'notification',
] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

export const VERIFICATION_STATUSES = ['verified', 'unverified', 'demo'] as const;
export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];

export const RECORD_TYPES = [
  'patent_application',
  'patent_grant',
  'gi_registration',
  'trademark',
  'design',
  'plant_variety',
  'abs_approval',
  'aggregate_statistic',
] as const;
export type RecordType = (typeof RECORD_TYPES)[number];

export const ANSWER_BLOCK_KINDS = ['answer', 'why', 'what_to_check', 'caveat'] as const;
export type AnswerBlockKind = (typeof ANSWER_BLOCK_KINDS)[number];

export const ABSTAIN_REASONS = [
  'nothing_relevant',
  'out_of_scope',
  'sources_conflict',
  'sources_out_of_date',
  'needs_more_facts',
  /** The question's language could not be searched against the corpus. */
  'language_unsupported',
] as const;
export type AbstainReason = (typeof ABSTAIN_REASONS)[number];

/**
 * The nine states the product can decline in. Finer-grained than
 * `AbstainReason`, which the answer-level confidence rule still produces; the
 * backend maps the older reasons and the guardrail refusals onto these.
 */
export const ABSTAIN_CODES = [
  'insufficient_authoritative_evidence',
  'missing_material_facts',
  'unsupported_jurisdiction',
  'conflicting_authoritative_sources',
  'source_status_uncertain',
  'professional_interpretation_required',
  'request_for_legal_verdict',
  'out_of_scope_clinical_query',
  'out_of_scope_non_ip',
] as const;
export type AbstainCode = (typeof ABSTAIN_CODES)[number];

/** A distinct legal question one product can raise. Not the same as a right. */
export const ISSUE_TYPES = [
  'patent',
  'traditional_knowledge',
  'biodiversity_abs',
  'drug_regulation',
  'food_regulation',
  'trade_mark',
  'design',
  'geographical_indication',
  'copyright',
  'trade_secret',
] as const;
export type IssueType = (typeof ISSUE_TYPES)[number];

export const ISSUE_STATUSES = ['indicated', 'not_indicated'] as const;
export type IssueStatus = (typeof ISSUE_STATUSES)[number];

export const CONFLICT_TYPES = [
  'jurisdictional',
  'scope_overlap',
  'authority',
  'temporal',
  'classification',
  'missing_fact',
  'true_source_conflict',
] as const;
export type ConflictType = (typeof CONFLICT_TYPES)[number];

export const RESOLUTION_STATUSES = [
  'separate_obligations',
  'resolved_by_authority',
  'resolved_by_date',
  'unresolved',
] as const;
export type ResolutionStatus = (typeof RESOLUTION_STATUSES)[number];

export const APPLICABILITY_STATUSES = ['applies', 'may_apply', 'not_indicated'] as const;
export type ApplicabilityStatus = (typeof APPLICABILITY_STATUSES)[number];

/** How much human help an answer needs. L0 none, L3 a professional now. */
export const ESCALATION_LEVELS = ['l0', 'l1', 'l2', 'l3'] as const;
export type EscalationLevel = (typeof ESCALATION_LEVELS)[number];

/** ISO date, `YYYY-MM-DD`. */
export type IsoDate = string;
/** ISO 8601 timestamp. */
export type IsoDateTime = string;

// ---------------------------------------------------------------------------
// Entities
// ---------------------------------------------------------------------------

/** A Layer 1 source. Normative. Citable as authority. */
export interface Document {
  document_id: string;
  title: string;
  short_title: string | null;
  organization: string;
  jurisdiction: Jurisdiction;
  regime_family: string;
  document_type: DocumentType;
  language: string;
  source_url: string | null;
  version_label: string | null;
  effective_from: IsoDate | null;
  effective_to: IsoDate | null;
  supersedes: string[];
  superseded_by: string | null;
  publication_date: IsoDate | null;
  retrieved_at: IsoDateTime | null;
  verification_status: VerificationStatus;
  checksum: string | null;
}

/** A section-aware passage. `section_path` is what makes a citation precise. */
export interface Chunk {
  chunk_id: string;
  document_id: string;
  text: string;
  section_path: string[];
  page_from: number | null;
  page_to: number | null;
  heading: string | null;
  token_count: number | null;
  embedding_ref: string | null;
  jurisdiction: Jurisdiction;
  ip_rights: IPRight[];
  regulatory_areas: RegulatoryArea[];
  product_classes: ProductClass[];
  effective_from: IsoDate | null;
  effective_to: IsoDate | null;
}

/** What a claim points at. Rendered claim-level, never as a footer. */
export interface Citation {
  citation_id: string;
  chunk_id: string;
  document_id: string;
  document_title: string;
  organization: string;
  jurisdiction: Jurisdiction;
  section_label: string | null;
  page: number | null;
  url: string | null;
  retrieval_score: number | null;
  rerank_score: number | null;
  verification_status: VerificationStatus;
  as_of_date: IsoDate | null;
  /** How far the source registry has checked this source, or null if it holds no record. */
  review_state: string | null;
  /** When a person last confirmed it against the official original. */
  reviewed_at: IsoDate | null;
  /** Cited as a known official source that could not be re-fetched; caps confidence. */
  provenance_pending: boolean;
}

/**
 * Layer 2 — evidential, never authority. `citable_in_answers` is typed `false`,
 * so a record cannot be passed anywhere a citation is expected.
 */
export interface Record_ {
  record_id: string;
  source_id: string;
  jurisdiction: Jurisdiction;
  record_type: RecordType;
  title: string;
  applicant: string | null;
  inventor_or_proprietor: string | null;
  filing_date: IsoDate | null;
  publication_date: IsoDate | null;
  grant_or_registration_date: IsoDate | null;
  status: string | null;
  classification_codes: string[];
  goods_or_field: string | null;
  abstract_text: string | null;
  snapshot_at: IsoDateTime | null;
  citable_in_answers: false;
}

/**
 * One sentence, and the passages that support it — or none.
 *
 * Citation is claim-level, not answer-level. A claim with no `citation_ids`
 * renders as general explanation and is marked as such, never quietly mixed in
 * with sourced text.
 */
export interface Claim {
  text: string;
  citation_ids: string[];
}

export interface AnswerBlock {
  id: string;
  kind: AnswerBlockKind;
  /** The flat rendering of `claims`; the backend rejects the two disagreeing. */
  text: string;
  /** The union of the claims' citation ids. */
  citation_ids: string[];
  claims: Claim[];
}

/** One answer, for one jurisdiction. Never merged across jurisdictions. */
/** Something the reader stated about their own situation, with their words. */
export interface Fact {
  key: string;
  value: boolean;
  span: string;
}

/** A fact a rule needed and the question did not give. Reported, never assumed. */
export interface MissingFact {
  key: string;
  question: string;
}

export interface IssueFinding {
  issue: IssueType;
  status: IssueStatus;
  reason_keys: string[];
  citation_ids: string[];
  confidence: Confidence | null;
  confidence_reason_keys: string[];
  missing_facts: MissingFact[];
}

/** Two sources that do not sit together, typed from metadata, never wording. */
export interface Conflict {
  conflict_id: string;
  conflict_type: ConflictType;
  issue: IssueType | null;
  source_a: string;
  source_b: string;
  governing_source: string | null;
  explanation_key: string;
  resolution_status: ResolutionStatus;
  reasoning_basis: string;
  requires_human_review: boolean;
}

export interface ProvisionApplicability {
  citation_id: string;
  status: ApplicabilityStatus;
  needs_facts: string[];
}

export interface Escalation {
  level: EscalationLevel;
  reason_keys: string[];
  /** Types of specialist, never named people or firms. */
  specialists: string[];
}

/** What the reasoning stage worked out, beside the answer it produced. */
export interface Analysis {
  facts: Fact[];
  missing_facts: MissingFact[];
  product_class: ProductClass;
  alternative_classes: ProductClass[];
  classification_rule_id: string | null;
  changes_if: string | null;
  issues: IssueFinding[];
  conflicts: Conflict[];
  applicability: ProvisionApplicability[];
  escalation: Escalation | null;
  abstain_code: AbstainCode | null;
  unsupported_jurisdictions: string[];
}

export interface Answer {
  answer_id: string;
  query_id: string;
  jurisdiction: Jurisdiction;
  language: string;
  product_class: ProductClass;
  ip_rights: IPRight[];
  regulatory_areas: RegulatoryArea[];
  blocks: AnswerBlock[];
  citations: Citation[];
  related_records: Record_[];
  confidence: Confidence;
  abstained: boolean;
  abstain_reason: AbstainReason | null;
  escalation_offered: boolean;
  as_of_date: IsoDate | null;
  corpus_version: string | null;
  latency_ms: number | null;
  is_demo: boolean;
  analysis: Analysis | null;
}

// ---------------------------------------------------------------------------
// Runtime shape descriptors — read by the drift test, not by the app
// ---------------------------------------------------------------------------

/** Enum name in the generated schema -> the values this file declares. */
export const DOMAIN_ENUMS = {
  Jurisdiction: JURISDICTIONS,
  IPRight: IP_RIGHTS,
  RegulatoryArea: REGULATORY_AREAS,
  ProductClass: PRODUCT_CLASSES,
  Confidence: CONFIDENCE_LEVELS,
  DocumentType: DOCUMENT_TYPES,
  VerificationStatus: VERIFICATION_STATUSES,
  RecordType: RECORD_TYPES,
  AnswerBlockKind: ANSWER_BLOCK_KINDS,
  AbstainReason: ABSTAIN_REASONS,
  AbstainCode: ABSTAIN_CODES,
  IssueType: ISSUE_TYPES,
  IssueStatus: ISSUE_STATUSES,
  ConflictType: CONFLICT_TYPES,
  ResolutionStatus: RESOLUTION_STATUSES,
  ApplicabilityStatus: APPLICABILITY_STATUSES,
  EscalationLevel: ESCALATION_LEVELS,
} as const satisfies Record<string, readonly string[]>;

/** Model name in the generated schema -> the fields this file declares. */
export const DOMAIN_FIELDS = {
  Document: [
    'document_id',
    'title',
    'short_title',
    'organization',
    'jurisdiction',
    'regime_family',
    'document_type',
    'language',
    'source_url',
    'version_label',
    'effective_from',
    'effective_to',
    'supersedes',
    'superseded_by',
    'publication_date',
    'retrieved_at',
    'verification_status',
    'checksum',
  ],
  Chunk: [
    'chunk_id',
    'document_id',
    'text',
    'section_path',
    'page_from',
    'page_to',
    'heading',
    'token_count',
    'embedding_ref',
    'jurisdiction',
    'ip_rights',
    'regulatory_areas',
    'product_classes',
    'effective_from',
    'effective_to',
  ],
  Citation: [
    'citation_id',
    'chunk_id',
    'document_id',
    'document_title',
    'organization',
    'jurisdiction',
    'section_label',
    'page',
    'url',
    'retrieval_score',
    'rerank_score',
    'verification_status',
    'as_of_date',
    'review_state',
    'reviewed_at',
    'provenance_pending',
  ],
  Record: [
    'record_id',
    'source_id',
    'jurisdiction',
    'record_type',
    'title',
    'applicant',
    'inventor_or_proprietor',
    'filing_date',
    'publication_date',
    'grant_or_registration_date',
    'status',
    'classification_codes',
    'goods_or_field',
    'abstract_text',
    'snapshot_at',
    'citable_in_answers',
  ],
  Fact: ['key', 'value', 'span'],
  MissingFact: ['key', 'question'],
  IssueFinding: [
    'issue',
    'status',
    'reason_keys',
    'citation_ids',
    'confidence',
    'confidence_reason_keys',
    'missing_facts',
  ],
  Conflict: [
    'conflict_id',
    'conflict_type',
    'issue',
    'source_a',
    'source_b',
    'governing_source',
    'explanation_key',
    'resolution_status',
    'reasoning_basis',
    'requires_human_review',
  ],
  ProvisionApplicability: ['citation_id', 'status', 'needs_facts'],
  Escalation: ['level', 'reason_keys', 'specialists'],
  Analysis: [
    'facts',
    'missing_facts',
    'product_class',
    'alternative_classes',
    'classification_rule_id',
    'changes_if',
    'issues',
    'conflicts',
    'applicability',
    'escalation',
    'abstain_code',
    'unsupported_jurisdictions',
  ],
  Claim: ['text', 'citation_ids'],
  AnswerBlock: ['id', 'kind', 'text', 'citation_ids', 'claims'],
  Answer: [
    'answer_id',
    'query_id',
    'jurisdiction',
    'language',
    'product_class',
    'ip_rights',
    'regulatory_areas',
    'blocks',
    'citations',
    'related_records',
    'confidence',
    'abstained',
    'abstain_reason',
    'escalation_offered',
    'as_of_date',
    'corpus_version',
    'latency_ms',
    'is_demo',
    'analysis',
  ],
} as const satisfies Record<string, readonly string[]>;
