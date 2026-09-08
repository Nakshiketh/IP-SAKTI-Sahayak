import type { Answer, Citation, Jurisdiction, ProductClass, Record_ } from '@/types/domain';
import type { ConfidenceResult, RetrievalEvidence } from '@/services/confidence';

/**
 * Asking a question.
 *
 * One interface, two implementations. `query.http.ts` talks to the API;
 * `query.mock.ts` answers from the demo fixture with no backend running. Which
 * one runs is decided by a single environment variable and by nothing else — no
 * component above this file knows which it got, which is the property the whole
 * mock layer existed to buy.
 *
 * The live implementation is the default. The mock is there for two cases that
 * are both real: a frontend test suite that should not need a Python process,
 * and a machine where the API is not running.
 */

/** A literal union so `t('followUps.' + key)` typechecks against the locale file. */
export type FollowUpKey = 'classify' | 'switchToExport' | 'switchToIndia' | 'abs' | 'priorArt';

/** Every stage the pipeline reports, in the order it runs them. */
export type StageId =
  | 'detect'
  | 'understand'
  | 'route'
  | 'retrieve'
  | 'rerank'
  | 'context'
  | 'generate'
  | 'map'
  | 'translate';

export interface StageTiming {
  /** Key under `sahayak.status.stages`. */
  id: StageId;
  ms: number;
}

/** What the language stage decided, so the composer can offer a correction. */
export interface LanguageDetection {
  language: string;
  confidence: number;
  ambiguousWith: string[];
  decided: boolean;
}

/**
 * Where the question was answered.
 *
 * `inferred` is true when the question named a jurisdiction the toggle did not.
 * The interface says so rather than quietly answering somewhere else.
 */
export interface RouteInfo {
  jurisdiction: Jurisdiction;
  inferred: boolean;
  marker: string | null;
}

export interface TranslationInfo {
  engine: string;
  translated: boolean;
}

export interface QueryResult {
  queryId: string;
  question: string;
  jurisdiction: Jurisdiction;
  evidence: RetrievalEvidence;
  confidence: ConfidenceResult;
  /** Null when the system abstained. There is no partial answer. */
  answer: Answer | null;
  /**
   * Records are returned beside an abstention as readily as beside an answer.
   * They never change the confidence and never rescue the abstention.
   */
  relatedRecords: Record_[];
  /** Keys under `sahayak.followUps`, derived from what the answer left open. */
  followUps: FollowUpKey[];
  stages: StageTiming[];
  totalMs: number;
  documentsSearched: number;
  /**
   * Every passage that was considered, as a citation, keyed by citation id.
   * An abstention has no answer to read its sources off, and the surface that
   * shows a conflict has to be able to name both sides of it.
   */
  sources: Record<string, Citation>;
  /** The text of each of those passages, keyed the same way, for the reveal. */
  passages: Record<string, string>;
  language: LanguageDetection;
  route: RouteInfo;
  corpusVersion: string;
  isDemo: boolean;
  translation: TranslationInfo;
  /** Set when the product declined the question rather than failing to answer. */
  refusal: string | null;
}

export interface QueryOptions {
  jurisdiction: Jurisdiction;
  productClass?: ProductClass;
  languageOut?: string;
  sessionId?: string;
  signal?: AbortSignal;
  /** Called as each stage finishes, so the status line is not a guess. */
  onStage?: (stage: StageTiming) => void;
  /** Called once retrieval has counted what it found. */
  onRetrieved?: (found: { passages: number; documents: number }) => void;
}

/**
 * What went wrong, as a key the interface renders in the reader's language.
 *
 * An error is not an abstention. Abstaining is the system working and saying
 * the evidence is too thin; this is the system not working. They render
 * differently and they must never be confused, which is why the failure path
 * has its own type rather than an `Answer` with a flag on it.
 */
export type QueryErrorCode =
  | 'unreachable'
  | 'generation_unavailable'
  | 'rate_limited'
  | 'request_too_large'
  | 'question_too_long'
  | 'unknown';

export class QueryError extends Error {
  readonly code: QueryErrorCode;

  constructor(code: QueryErrorCode, message: string) {
    super(message);
    this.name = 'QueryError';
    this.code = code;
  }
}

/**
 * Which implementation runs.
 *
 * `VITE_SAHAYAK_API` is the one switch: `live` (the default) talks to the API,
 * `mock` answers from the fixture. Under test the mock is the default, because
 * a component test asserting on rendering should not be asserting on a network.
 */
export type ApiMode = 'live' | 'mock';

export function apiMode(): ApiMode {
  const configured = import.meta.env.VITE_SAHAYAK_API as string | undefined;
  if (configured === 'mock' || configured === 'live') return configured;
  return import.meta.env.MODE === 'test' ? 'mock' : 'live';
}

export async function runQuery(question: string, options: QueryOptions): Promise<QueryResult> {
  if (apiMode() === 'mock') {
    const { runMockQuery } = await import('@/services/query.mock');
    return runMockQuery(question, options);
  }
  const { runHttpQuery } = await import('@/services/query.http');
  return runHttpQuery(question, options);
}
