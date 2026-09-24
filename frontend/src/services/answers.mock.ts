// DEMO DATA — not a legal source
//
// The illustrative answer, assembled from the two fixture files under
// `data/fixtures`. Those files are read by the backend's fixture generator as
// well, which is the point: the answer a reader sees with no backend running
// and the answer the API serves from the demo corpus are the same words citing
// the same passages, because there is one copy of both.
//
// What this module adds on top of the fixture is display-only: the confidence
// level shown on the static example pages. Confidence is computed from the
// retrieval result everywhere it matters — `scoreConfidence` in the workspace,
// the Python rule in the API — and these two values exist so the homepage and
// the how-it-works page can show a worked example of each without running a
// query.
//
// Three rules this fixture follows, and any future fixture must follow:
//
//  1. Every document id is prefixed `demo-`, every verification_status is
//     "demo", and every answer sets is_demo, so the interface can mark it.
//  2. No invented statutory text. The `passage` on a demo citation says plainly
//     that it is a placeholder. Showing fabricated provision wording — even in a
//     demo — is the exact failure this product exists to avoid.
//  3. No invented section numbers or dates. Where a source is named, it is named
//     by its published title and the heading of the part being pointed at.

import corpusFixture from '@fixtures/demo-corpus.json';
import answersFixture from '@fixtures/demo-answers.json';

import type {
  Answer,
  AnswerBlockKind,
  Citation,
  Confidence,
  IPRight,
  Jurisdiction,
  ProductClass,
  RegulatoryArea,
  Record_,
} from '@/types/domain';

/** A demo citation carries the placeholder passage the UI reveals on request. */
export interface DemoCitation extends Citation {
  passage: string;
}

interface FixtureDocument {
  document_id: string;
  document_title: string;
  organization: string;
  jurisdiction: Jurisdiction;
  document_type: string;
  source_url: string | null;
}

interface FixtureChunk {
  chunk_id: string;
  document_id: string;
  heading: string;
  section_path: string[];
  text: string;
}

interface FixtureClaim {
  text: string;
  passage_ids: string[];
}

interface FixtureBlock {
  kind: AnswerBlockKind;
  claims: FixtureClaim[];
}

interface FixtureAnswer {
  product_class: ProductClass;
  ip_rights: IPRight[];
  regulatory_areas: RegulatoryArea[];
  blocks: FixtureBlock[];
}

interface FixtureRecord {
  record_id: string;
  source_id: string;
  jurisdiction: Jurisdiction;
  record_type: Record_['record_type'];
  title: string;
  applicant: string;
  status: string;
}

const corpus = corpusFixture as unknown as {
  documents: FixtureDocument[];
  chunks: FixtureChunk[];
};
const fixture = answersFixture as unknown as {
  question: string;
  answers: Record<Jurisdiction, FixtureAnswer>;
  records: FixtureRecord[];
};

const DOCUMENTS = new Map(corpus.documents.map((document) => [document.document_id, document]));

/**
 * A citation is a pointer to a passage, so its id is the passage's id. The API
 * does the same thing, which is what lets a citation rendered from the mock and
 * one rendered from the API be compared at all.
 */
function citationFor(chunk: FixtureChunk): DemoCitation {
  const document = DOCUMENTS.get(chunk.document_id);
  if (!document) throw new Error(`demo chunk names an unknown document: ${chunk.chunk_id}`);
  return {
    citation_id: chunk.chunk_id,
    chunk_id: chunk.chunk_id,
    document_id: document.document_id,
    document_title: document.document_title,
    organization: document.organization,
    jurisdiction: document.jurisdiction,
    section_label: chunk.section_path.join(' › ') || chunk.heading,
    page: null,
    url: document.source_url,
    retrieval_score: null,
    rerank_score: null,
    verification_status: 'demo',
    as_of_date: null,
    review_state: null,
    reviewed_at: null,
    provenance_pending: false,
    passage: chunk.text,
  };
}

const CITATIONS = new Map(corpus.chunks.map((chunk) => [chunk.chunk_id, citationFor(chunk)]));

/** The question the homepage answers, and the one the composer pre-fills. */
export const DEMO_QUESTION = fixture.question;

/**
 * The confidence each illustrative answer is shown at.
 *
 * Display-only, and only for the two pages that show a worked example without
 * running a query. The India example is moderate and the international one is
 * low, which is the honest shape of the demo corpus: there is more of it on the
 * Indian side, and the difference is worth a reader seeing.
 */
const DEMO_CONFIDENCE: Record<Jurisdiction, Confidence> = { IN: 'moderate', INTL: 'low' };

function buildAnswer(jurisdiction: Jurisdiction): Answer {
  const source = fixture.answers[jurisdiction];
  const used: string[] = [];

  const blocks = source.blocks.map((block, index) => {
    const claims = block.claims.map((claim) => {
      for (const id of claim.passage_ids) if (!used.includes(id)) used.push(id);
      return { text: claim.text, citation_ids: claim.passage_ids };
    });
    return {
      id: `${block.kind}-${index}`,
      kind: block.kind,
      text: claims.map((claim) => claim.text).join(' '),
      citation_ids: [...new Set(claims.flatMap((claim) => claim.citation_ids))].sort(),
      claims,
    };
  });

  return {
    answer_id: `demo-answer-${jurisdiction.toLowerCase()}`,
    query_id: 'demo-query-1',
    jurisdiction,
    language: 'en',
    product_class: source.product_class,
    ip_rights: source.ip_rights,
    regulatory_areas: source.regulatory_areas,
    confidence: DEMO_CONFIDENCE[jurisdiction],
    abstained: false,
    abstain_reason: null,
    escalation_offered: true,
    as_of_date: null,
    corpus_version: null,
    latency_ms: null,
    is_demo: true,
    citations: used.map((id) => {
      const citation = CITATIONS.get(id);
      if (!citation) throw new Error(`demo answer cites an unknown passage: ${id}`);
      return citation;
    }),
    related_records: [],
    blocks,
  };
}

/**
 * One question, two answer sets, never merged. Switching jurisdiction swaps the
 * whole answer rather than filtering one.
 */
export const DEMO_ANSWERS: Record<Jurisdiction, Answer> = {
  IN: buildAnswer('IN'),
  INTL: buildAnswer('INTL'),
};

export const DEMO_RECORDS: Record_[] = fixture.records.map((record) => ({
  record_id: record.record_id,
  source_id: record.source_id,
  jurisdiction: record.jurisdiction,
  record_type: record.record_type,
  title: record.title,
  applicant: record.applicant,
  inventor_or_proprietor: null,
  filing_date: null,
  publication_date: null,
  grant_or_registration_date: null,
  status: record.status,
  classification_codes: [],
  goods_or_field: null,
  abstract_text: null,
  snapshot_at: null,
  citable_in_answers: false,
}));

export function demoCitationsFor(answer: Answer): DemoCitation[] {
  return answer.citations as DemoCitation[];
}

/** The passage text behind every demo citation, keyed by citation id. */
export function demoPassages(answer: Answer): Record<string, string> {
  return Object.fromEntries(
    answer.citations.map((citation) => [
      citation.citation_id,
      CITATIONS.get(citation.citation_id)?.passage ?? '',
    ]),
  );
}
