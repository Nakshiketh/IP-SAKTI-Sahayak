// The worked example shown on the homepage and on /how-it-works.
//
// Assembled from `corpus/guidance/knowledge-base.json` — the same verified
// passages the API answers from — so every sentence here is the text of a
// passage, every citation names the official document it restates, and every
// source card links to that document. Nothing on these pages is a stand-in.
//
// The example is chosen rather than retrieved: the two pages show it without
// running a query. The passages it uses are listed by id below, and a missing
// id throws at build time rather than rendering a citation to nothing.

import knowledgeBase from '@corpus/guidance/knowledge-base.json';
import sources from '@corpus/guidance/sources.json';

import type {
  Answer,
  AnswerBlockKind,
  Citation,
  Confidence,
  IPRight,
  Jurisdiction,
  RegulatoryArea,
} from '@/types/domain';

/** A citation that carries the passage it points at, for the source card. */
export interface PassageCitation extends Citation {
  passage: string;
}

interface KnowledgeDocument {
  document_id: string;
  document_title: string;
  organization: string;
  jurisdiction: Jurisdiction;
  source_url: string;
}

interface KnowledgeChunk {
  chunk_id: string;
  document_id: string;
  heading?: string;
  section_path?: string[];
  text: string;
  step_title?: string;
  ip_rights?: IPRight[];
  regulatory_areas?: RegulatoryArea[];
}

const kb = {
  ...(knowledgeBase as unknown as {
    chunks: KnowledgeChunk[];
    procedures: Record<string, { caveat?: string }>;
  }),
  ...(sources as unknown as {
    corpus_version: string;
    reviewed_on: string;
    documents: KnowledgeDocument[];
  }),
};

const DOCUMENTS = new Map(kb.documents.map((document) => [document.document_id, document]));
const CHUNKS = new Map(kb.chunks.map((chunk) => [chunk.chunk_id, chunk]));

function chunkFor(id: string): KnowledgeChunk {
  const chunk = CHUNKS.get(id);
  if (!chunk) throw new Error(`example answer names an unknown passage: ${id}`);
  return chunk;
}

function citationFor(id: string): PassageCitation {
  const chunk = chunkFor(id);
  const document = DOCUMENTS.get(chunk.document_id);
  if (!document) throw new Error(`passage names an unknown document: ${id}`);
  return {
    citation_id: chunk.chunk_id,
    chunk_id: chunk.chunk_id,
    document_id: document.document_id,
    document_title: document.document_title,
    organization: document.organization,
    jurisdiction: document.jurisdiction,
    section_label: (chunk.section_path ?? []).join(' › ') || chunk.heading || null,
    page: null,
    url: document.source_url,
    retrieval_score: null,
    rerank_score: null,
    verification_status: 'verified',
    as_of_date: kb.reviewed_on,
    review_state: 'verified_official',
    reviewed_at: kb.reviewed_on,
    provenance_pending: false,
    passage: chunk.text,
  };
}

interface ExampleBlock {
  kind: AnswerBlockKind;
  /** Passage ids, in reading order. A passage with a step title opens a step. */
  passages: readonly string[];
  /** A framing sentence with no citation, shown as such. */
  framing?: string | undefined;
}

interface ExampleSpec {
  confidence: Confidence;
  blocks: readonly ExampleBlock[];
}

/**
 * The India answer walks the patent route for a new polyherbal formulation;
 * the international one covers protecting it abroad. Two answer sets, never
 * merged — switching jurisdiction swaps the whole answer.
 */
const EXAMPLES: Record<Jurisdiction, ExampleSpec> = {
  IN: {
    confidence: 'high',
    blocks: [
      {
        kind: 'answer',
        passages: [
          'kb-in-patent-02-search',
          'kb-in-patent-02-search-inpass',
          'kb-in-patent-04-specification',
          'kb-in-patent-05-nba',
          'kb-in-patent-06-file',
          'kb-in-patent-06-where',
          'kb-in-patent-09-rfe',
        ],
      },
      { kind: 'why', passages: ['kb-in-patent-03-ayush-principles'] },
      { kind: 'what_to_check', passages: ['kb-in-patent-03-synergy-data'] },
      { kind: 'caveat', passages: [], framing: kb.procedures['in-patent']?.caveat },
    ],
  },
  INTL: {
    confidence: 'high',
    blocks: [
      {
        kind: 'answer',
        passages: ['kb-intl-pct-route', 'kb-intl-pct-india-entry', 'kb-intl-paris-priority'],
      },
      { kind: 'why', passages: ['kb-intl-gratk'] },
      { kind: 'what_to_check', passages: ['kb-intl-patentscope', 'kb-intl-brand-db'] },
    ],
  },
};

function buildAnswer(jurisdiction: Jurisdiction): Answer {
  const spec = EXAMPLES[jurisdiction];
  const used: string[] = [];
  let step = 0;

  const blocks = spec.blocks
    .map((block, index) => {
      const claims = block.passages.map((id) => {
        const chunk = chunkFor(id);
        used.push(id);
        let text = chunk.text;
        if (chunk.step_title) {
          step += 1;
          text = `Step ${step} — ${chunk.step_title}. ${text}`;
        }
        return { text, citation_ids: [id] };
      });
      if (block.framing) claims.push({ text: block.framing, citation_ids: [] });
      return {
        id: `${block.kind}-${index}`,
        kind: block.kind,
        text: claims.map((claim) => claim.text).join(' '),
        citation_ids: [...new Set(claims.flatMap((claim) => claim.citation_ids))].sort(),
        claims,
      };
    })
    .filter((block) => block.claims.length > 0);

  const chunks = used.map(chunkFor);
  return {
    answer_id: `example-answer-${jurisdiction.toLowerCase()}`,
    query_id: 'example',
    jurisdiction,
    language: 'en',
    product_class: 'undetermined',
    ip_rights: [...new Set(chunks.flatMap((chunk) => chunk.ip_rights ?? []))],
    regulatory_areas: [...new Set(chunks.flatMap((chunk) => chunk.regulatory_areas ?? []))],
    confidence: spec.confidence,
    abstained: false,
    abstain_reason: null,
    escalation_offered: true,
    as_of_date: kb.reviewed_on,
    corpus_version: kb.corpus_version,
    latency_ms: null,
    is_demo: false,
    // No reasoning stage runs on this path; the backend supplies it.
    analysis: null,
    citations: used.map(citationFor),
    related_records: [],
    blocks,
  };
}

export const EXAMPLE_ANSWERS: Record<Jurisdiction, Answer> = {
  IN: buildAnswer('IN'),
  INTL: buildAnswer('INTL'),
};

/** The date the verified sources were last checked. */
export const SOURCES_REVIEWED_ON = kb.reviewed_on;
