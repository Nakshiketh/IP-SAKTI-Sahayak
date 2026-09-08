// DEMO DATA — not a legal source
//
// The mock query service. It satisfies the same interface as the API client in
// `query.http.ts`, which is what lets a component test run without a Python
// process and a machine with no backend still show the product.
//
// What is genuinely computed here, rather than hard-coded: the confidence level
// and its reason come from `scoreConfidence`, run over evidence the fixture
// supplies. The fixtures set the *retrieval result*; the rule decides what that
// means — the same rule, over the same shared case set, that the API runs.
//
// What is not real here, and is real in the API: retrieval. This file decides
// which fixture a question lands on by keyword, so a demo can trigger each
// state deliberately. The API scores the question against the demo corpus and
// lets the outcome fall out. Where the two disagree, the API is right.

import { DEMO_ANSWERS, DEMO_RECORDS, demoPassages } from '@/services/answers.mock';
import { scoreConfidence, type RetrievalEvidence } from '@/services/confidence';
import type { FollowUpKey, QueryOptions, QueryResult, StageTiming } from '@/services/query';
import type { Answer, Citation, Jurisdiction } from '@/types/domain';

function passagesFor(answer: Answer, scores: number[], inWindow = true) {
  return answer.citations.map((citation, index) => ({
    citation_id: citation.citation_id,
    document_id: citation.document_id,
    retrieval_score: (scores[index] ?? 0.6) + 0.03,
    rerank_score: scores[index] ?? 0.6,
    within_effective_window: inWindow,
  }));
}

/**
 * Simulated latency, so the two status lines are visible at all.
 *
 * The API replaces this with the time the stages actually took. It lives here
 * rather than in the component so there is one place to delete it when the mock
 * goes.
 */
export const MOCK_LATENCY_MS = { searching: 140, reading: 180 };

const STAGES: StageTiming[] = [
  { id: 'detect', ms: 12 },
  { id: 'understand', ms: 210 },
  { id: 'route', ms: 4 },
  { id: 'retrieve', ms: 640 },
  { id: 'rerank', ms: 480 },
  { id: 'context', ms: 60 },
  { id: 'generate', ms: 390 },
  { id: 'map', ms: 44 },
  { id: 'translate', ms: 8 },
];

/**
 * Which fixture a question lands on.
 *
 * Keyword routing, so a demo can trigger each state deliberately rather than
 * hoping for one. Every branch is a state the real pipeline produces, and the
 * abstention branches are the ones worth showing.
 */
type Scenario =
  | 'answer'
  | 'out_of_scope'
  | 'nothing_relevant'
  | 'sources_conflict'
  | 'sources_out_of_date'
  | 'needs_more_facts';

export function classifyQuestion(question: string): Scenario {
  const q = question.toLowerCase();

  // Clinical questions, and questions asking for an outcome prediction.
  if (/\b(dose|dosage|how much|mg|treat|cure|prescrib|symptom|patient)\b/.test(q)) {
    return 'out_of_scope';
  }
  if (/\b(will|would)\b.*\b(granted|succeed|approved|win)\b/.test(q)) return 'out_of_scope';
  if (/\bdraft\b.*\b(application|specification|agreement)\b/.test(q)) return 'out_of_scope';

  // A jurisdiction the corpus does not cover.
  if (/\b(brazil|japan|nigeria|china|russia|indonesia|kenya)\b/.test(q)) return 'nothing_relevant';

  if (/\b(medicine|drug)\b.*\b(food|nutraceutical|supplement|cosmetic)\b/.test(q)) {
    return 'needs_more_facts';
  }
  if (/\b(conflict|disagree|contradict|shelf life)\b/.test(q)) return 'sources_conflict';
  if (/\b(superseded|out of date|still current|repealed)\b/.test(q)) return 'sources_out_of_date';

  return 'answer';
}

function evidenceFor(scenario: Scenario, jurisdiction: Jurisdiction): RetrievalEvidence {
  const answer = DEMO_ANSWERS[jurisdiction];
  const base = {
    jurisdiction,
    contradictions: [] as Array<[string, string]>,
    out_of_scope: false,
    needs_more_facts: false,
  };

  switch (scenario) {
    case 'out_of_scope':
      return { ...base, passages: [], out_of_scope: true };
    case 'nothing_relevant':
      // Retrieval ran and returned only noise: below the floor is below the floor.
      return { ...base, passages: passagesFor(answer, [0.19, 0.12, 0.08, 0.05]) };
    case 'sources_conflict':
      return {
        ...base,
        passages: passagesFor(answer, [0.78, 0.41, 0.2, 0.15]),
        contradictions: [
          [answer.citations[0]?.citation_id ?? 'a', answer.citations[1]?.citation_id ?? 'b'],
        ],
      };
    case 'sources_out_of_date':
      return { ...base, passages: passagesFor(answer, [0.74, 0.68, 0.6, 0.55], false) };
    case 'needs_more_facts':
      return {
        ...base,
        passages: passagesFor(answer, [0.79, 0.71, 0.66, 0.58]),
        needs_more_facts: true,
      };
    case 'answer':
    default:
      // India retrieves several strong passages across several documents. The
      // international fixture retrieves two, neither of them strong — which is
      // why its own caveat says the sources are thinner, and why the rule
      // returns `low`.
      return {
        ...base,
        passages: passagesFor(
          answer,
          jurisdiction === 'IN' ? [0.82, 0.74, 0.61, 0.57] : [0.49, 0.42],
        ),
      };
  }
}

/**
 * Follow-ups, derived from what the answer left open rather than from a list.
 *
 * Rule-based, and the rules are visible: an unknown product class is the gap
 * that matters most, a caveat naming another jurisdiction is the next.
 */
function followUpsFor(answer: Answer | null, jurisdiction: Jurisdiction): FollowUpKey[] {
  if (!answer) return [];
  const keys: FollowUpKey[] = [];

  if (answer.product_class === 'undetermined') keys.push('classify');
  if (answer.blocks.some((block) => /abroad|export|another market|destination/i.test(block.text))) {
    keys.push(jurisdiction === 'IN' ? 'switchToExport' : 'switchToIndia');
  }
  if (answer.regulatory_areas.includes('abs_compliance')) keys.push('abs');
  if (answer.ip_rights.includes('patent')) keys.push('priorArt');

  return keys.slice(0, 3);
}

/** Every demo citation the jurisdiction can produce, keyed by citation id. */
function sourcesFor(jurisdiction: Jurisdiction): Record<string, Citation> {
  return Object.fromEntries(
    DEMO_ANSWERS[jurisdiction].citations.map((citation) => [citation.citation_id, citation]),
  );
}

/** The synchronous core, so a test can assert on an outcome without awaiting. */
export function buildMockResult(question: string, jurisdiction: Jurisdiction): QueryResult {
  const scenario = classifyQuestion(question);
  const evidence = evidenceFor(scenario, jurisdiction);
  const confidence = scoreConfidence(evidence);

  const abstained = confidence.level === 'abstain';
  const source = DEMO_ANSWERS[jurisdiction];
  const answer: Answer | null = abstained
    ? null
    : { ...source, confidence: confidence.level, abstained: false, abstain_reason: null };

  // Records are attached on their own terms. Note that they are attached to the
  // abstention cases too — deliberately, because the rule that matters is that
  // their presence changes nothing.
  const relatedRecords =
    jurisdiction === 'IN' && /patent|formulation|composition|herb/i.test(question)
      ? DEMO_RECORDS
      : [];

  const stages = scenario === 'out_of_scope' ? STAGES.slice(0, 2) : STAGES;

  return {
    queryId: 'demo-query-1',
    question,
    jurisdiction,
    evidence,
    confidence,
    answer,
    relatedRecords,
    followUps: followUpsFor(answer, jurisdiction),
    stages,
    totalMs: stages.reduce((sum, stage) => sum + stage.ms, 0),
    documentsSearched: new Set(evidence.passages.map((p) => p.document_id)).size,
    sources: sourcesFor(jurisdiction),
    passages: demoPassages(DEMO_ANSWERS[jurisdiction]),
    language: { language: 'en', confidence: 1, ambiguousWith: [], decided: true },
    route: { jurisdiction, inferred: false, marker: null },
    corpusVersion: '0.0.0-demo',
    isDemo: true,
    translation: { engine: 'passthrough', translated: false },
    refusal: scenario === 'out_of_scope' ? 'clinical' : null,
  };
}

export async function runMockQuery(question: string, options: QueryOptions): Promise<QueryResult> {
  const result = buildMockResult(question, options.jurisdiction);
  for (const stage of result.stages) options.onStage?.(stage);
  const candidates = result.evidence.passages.filter((p) => p.rerank_score >= 0.35);
  options.onRetrieved?.({
    passages: candidates.length,
    documents: new Set(candidates.map((p) => p.document_id)).size,
  });
  return result;
}
