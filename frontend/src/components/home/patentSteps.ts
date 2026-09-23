import type { FlowKind } from '@/components/flows/FlowOffer';
import type { DocumentId } from '@/services/corpusManifest';

/**
 * The route a patent application takes in India, as fifteen steps — what to do
 * at each one, where, on which form, and the official source to check.
 *
 * **Ids are a literal union, not `string`**, so `t('patentSteps.steps.' + id)`
 * typechecks. A step added here without matching copy fails the build rather
 * than rendering a raw key to a reader — the same rule `pipelineStages.ts`
 * follows.
 *
 * **What a citation here claims.** `documents` names the instruments that
 * govern a step, and every id is checked against `corpus/manifest.json` by
 * `<Src>` at render — an id that resolves to nothing throws rather than
 * rendering a citation to a document that does not exist. `locator` names the
 * provisions the step's copy restates, and `official` links the verified
 * official documents and portals behind it, from
 * `corpus/guidance/knowledge-base.json`. The step copy is written from those
 * same verified passages, so this page and an Ask Sahayak answer say the same
 * thing.
 *
 * **Every step hands off to the product, and only to something that exists.**
 * Each step carries a prepared question (`patentSteps.questions.<id>`) that is
 * sent to the workspace exactly as a reader would type it, so what comes back
 * is the pipeline's own answer or its own reason for declining — this file
 * decides neither. Two steps also open a tool, because the workspace has one
 * for them: the prior-art flow for the search, and the classification flow for
 * patentability, since the product type decides how much of a formulation can
 * be claimed at all. No step names a tool the workspace lacks.
 */

export type PatentStepId =
  | 'disclosure'
  | 'search'
  | 'patentability'
  | 'drafting'
  | 'biodiversity'
  | 'filing'
  | 'complete'
  | 'publication'
  | 'examination'
  | 'fer'
  | 'hearing'
  | 'grant'
  | 'opposition'
  | 'renewal'
  | 'working';

/**
 * Form ids, as a union for the same reason step ids are one: a form named here
 * without a label in the locale file must fail the build, not render
 * `patentSteps.forms.form42` to a reader.
 */
export type PatentFormId =
  | 'form1'
  | 'form2'
  | 'form3'
  | 'form4'
  | 'form5'
  | 'form9'
  | 'form18'
  | 'form18a'
  | 'form25'
  | 'form26'
  | 'form27'
  | 'form28'
  | 'nbaForm7'
  | 'nbaForm8'
  | 'nbaForm9';

/**
 * Four stretches of the route. A grouping for reading, not a legal category —
 * the Act does not divide itself this way, and nothing here says it does.
 */
export type PatentPhaseId = 'before' | 'filing' | 'examination' | 'after';

export const PATENT_PHASES: readonly PatentPhaseId[] = ['before', 'filing', 'examination', 'after'];

/**
 * The workspace tools a step can open. A subset of the flows the workspace
 * actually renders, so a step cannot link to a tool that is not there.
 */
export type PatentStepTool = Extract<FlowKind, 'priorArt' | 'classify'>;

export interface PatentStep {
  id: PatentStepId;
  phase: PatentPhaseId;
  /**
   * Manifest document ids this step rests on, in the order they are cited.
   * Validated at render: `<Src>` throws on an id the manifest does not hold.
   */
  documents: readonly DocumentId[];
  /** The provisions the step's copy restates. Shown when a step is opened. */
  locator: string;
  /**
   * Verified official sources for the step: document ids in
   * `corpus/guidance/sources.json`, each rendered as a link to the
   * official document or portal. An unknown id throws at render.
   */
  official: readonly string[];
  /** Forms named by the step, shown as chips. Empty where none applies. */
  forms: readonly PatentFormId[];
  /** The workspace tool this step opens, where the workspace has one. */
  tool: PatentStepTool | null;
}

/**
 * In procedural order. The order is the content — a reader scanning this is
 * learning the sequence, and any other ordering would be a different claim.
 */
export const PATENT_STEPS: readonly PatentStep[] = [
  {
    id: 'disclosure',
    phase: 'before',
    documents: ['in-patents-act-1970'],
    locator: 'Patents Act 1970, s.2(1)(j), s.2(1)(l)',
    official: ['in-patents-act-1970'],
    forms: [],
    tool: null,
  },
  {
    id: 'search',
    phase: 'before',
    // For an Ayurvedic formulation the traditional-knowledge search is part of
    // the first search, not a check performed after a draft exists.
    documents: ['in-tk-biological-material-guidelines', 'in-tkdl-access-model'],
    locator: 'Guidelines for Examination of Ayush Related Inventions 2025, para 3.3 and Annexure-I',
    official: [
      'in-portal-patent-search',
      'intl-patentscope',
      'in-tkdl',
      'in-ayush-inventions-guidelines-2025',
    ],
    forms: [],
    tool: 'priorArt',
  },
  {
    id: 'patentability',
    phase: 'before',
    documents: ['in-patents-act-1970'],
    locator:
      'Patents Act 1970, s.2(1)(j), s.2(1)(ja), s.2(1)(ac), s.3(d), s.3(e), s.3(p); Ayush guidelines 2025, para 3.4 and Annexure-II',
    official: ['in-patents-act-1970', 'in-ayush-inventions-guidelines-2025'],
    forms: [],
    tool: 'classify',
  },
  {
    id: 'drafting',
    phase: 'before',
    documents: ['in-patents-act-1970', 'in-patents-rules-2003'],
    locator: 'Patents Act 1970, s.9, s.10(4); Patents Rules 2003, r.13',
    official: ['in-patents-act-1970', 'in-portal-patent-forms-fees'],
    forms: ['form2'],
    tool: null,
  },
  {
    id: 'biodiversity',
    phase: 'before',
    documents: ['in-biological-diversity-act-2002', 'in-nba-abs-guidelines'],
    locator:
      'Biological Diversity Act 2002, s.6 as amended in 2023; NBA Office Memorandum of 10 July 2025',
    official: ['in-bd-amendment-act-2023', 'in-nba-ipr-forms-2025', 'in-portal-nba-abs'],
    forms: ['nbaForm7', 'nbaForm8', 'nbaForm9'],
    tool: null,
  },
  {
    id: 'filing',
    phase: 'filing',
    documents: ['in-patents-act-1970', 'in-patents-rules-2003'],
    locator: 'Patents Act 1970, s.6, s.7, s.8; Patents Rules 2003, r.4 and First Schedule',
    official: [
      'in-portal-patent-efiling',
      'in-patent-forms-list-2024',
      'in-portal-patent-forms-fees',
    ],
    forms: ['form1', 'form2', 'form3', 'form5', 'form26', 'form28'],
    tool: null,
  },
  {
    id: 'complete',
    phase: 'filing',
    documents: ['in-patents-act-1970'],
    locator: 'Patents Act 1970, s.9(1), s.39, s.135',
    official: ['in-patents-act-1970', 'intl-pct'],
    forms: ['form2', 'form25'],
    tool: null,
  },
  {
    id: 'publication',
    phase: 'filing',
    documents: ['in-patents-act-1970', 'in-patents-rules-2003'],
    locator: 'Patents Act 1970, s.11A, s.25(1); Patents Rules 2003, r.24, r.24A',
    official: ['in-patents-rules-2003', 'in-portal-patent-journal'],
    forms: ['form9'],
    tool: null,
  },
  {
    id: 'examination',
    phase: 'examination',
    documents: ['in-patents-act-1970', 'in-patents-rules-2003'],
    locator: 'Patents Act 1970, s.11B; Patents Rules 2003, r.24B and r.24C, as amended in 2024',
    official: ['in-patents-amendment-rules-2024', 'in-patents-rules-2003'],
    forms: ['form18', 'form18a'],
    tool: null,
  },
  {
    id: 'fer',
    phase: 'examination',
    documents: ['in-patents-act-1970', 'in-patents-rules-2003'],
    locator: 'Patents Act 1970, s.21; Patents Rules 2003, r.24B(3), r.24B(5), r.24B(6)',
    official: ['in-patents-rules-2003'],
    forms: ['form4'],
    tool: null,
  },
  {
    id: 'hearing',
    phase: 'examination',
    documents: ['in-patents-act-1970', 'in-patent-office-manual'],
    locator:
      'Patents Act 1970, s.14, s.15, s.117A; Manual of Patent Office Practice and Procedure, para 09.05',
    official: ['in-patent-office-manual', 'in-patents-act-1970'],
    forms: [],
    tool: null,
  },
  {
    id: 'grant',
    phase: 'after',
    documents: ['in-patents-act-1970'],
    locator: 'Patents Act 1970, s.43',
    official: ['in-patents-act-1970', 'in-portal-patent-search'],
    forms: [],
    tool: null,
  },
  {
    id: 'opposition',
    phase: 'after',
    documents: ['in-patents-act-1970'],
    locator: 'Patents Act 1970, s.25(1), s.25(2)',
    official: ['in-patents-act-1970'],
    forms: [],
    tool: null,
  },
  {
    id: 'renewal',
    phase: 'after',
    documents: ['in-patents-act-1970', 'in-patents-rules-2003'],
    locator: 'Patents Act 1970, s.53; Patents Rules 2003, r.80 as amended in 2024',
    official: ['in-patents-rules-2003', 'in-patents-amendment-rules-2024'],
    forms: ['form4'],
    tool: null,
  },
  {
    id: 'working',
    phase: 'after',
    documents: ['in-patents-act-1970', 'in-patents-rules-2003'],
    locator: 'Patents Act 1970, s.146(2); Patents Rules 2003, r.131(2) as amended in 2024',
    official: ['in-patents-amendment-rules-2024'],
    forms: ['form27'],
    tool: null,
  },
];

/** Every document any step cites, deduplicated, for one `<SourceScope>`. */
export const PATENT_STEP_DOCUMENTS: readonly DocumentId[] = [
  ...new Set(PATENT_STEPS.flatMap((step) => step.documents)),
];

/** The workspace address for a step's prepared question. */
export function askHref(question: string): string {
  return `/sahayak?q=${encodeURIComponent(question)}`;
}

/** The workspace address that opens a tool straight away. */
export function toolHref(tool: PatentStepTool): string {
  return `/sahayak?flow=${tool}`;
}
