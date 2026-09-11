import type { FlowKind } from '@/components/flows/FlowOffer';
import type { DocumentId } from '@/services/corpusManifest';

/**
 * The route a patent application takes in India, as twelve steps — and what
 * Sahayak does at each one.
 *
 * **Ids are a literal union, not `string`**, so `t('patentSteps.steps.' + id)`
 * typechecks. A step added here without matching copy fails the build rather
 * than rendering a raw key to a reader — the same rule `pipelineStages.ts`
 * follows.
 *
 * **What a citation here does and does not claim.** `documents` names the
 * instruments that govern a step, and every id is checked against
 * `corpus/manifest.json` by `<Src>` at render — an id that resolves to nothing
 * throws rather than rendering a citation to a document that does not exist.
 *
 * `locator` is different, and the difference matters. It is a *pointer to where
 * to read*, not a retrieved quotation: no document in the manifest has been
 * ingested, so nothing here has been read out of a source by this system. A
 * locator says "this is the provision to look up", which is a navigational
 * claim the product can honestly make. It does not say what that provision
 * contains. Any statement of what the law *requires* belongs in a retrieved,
 * cited answer from the pipeline — not in a static array on a marketing page.
 *
 * **Every step hands off to the product, and only to something that exists.**
 * Each step carries a prepared question (`patentSteps.questions.<id>`) that is
 * sent to the workspace exactly as a reader would type it, so what comes back
 * is the pipeline's own answer or its own reason for declining — this file
 * decides neither. Two steps also open a tool, because the workspace has one
 * for them: the prior-art flow for the first search, and the classification
 * flow for patentability, since the product type decides how much of a
 * formulation can be claimed at all. No step names a tool the workspace lacks.
 */

export type PatentStepId =
  | 'disclosure'
  | 'patentability'
  | 'drafting'
  | 'filing'
  | 'complete'
  | 'publication'
  | 'examination'
  | 'fer'
  | 'hearing'
  | 'grant'
  | 'opposition'
  | 'renewal';

/**
 * Form ids, as a union for the same reason step ids are one: a form named here
 * without a label in the locale file must fail the build, not render
 * `patentSteps.forms.form42` to a reader.
 */
export type PatentFormId = 'form1' | 'form2' | 'form3' | 'form5' | 'form9' | 'form18' | 'form26';

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
  /**
   * Where to read, inside those documents. A navigational pointer, never a
   * paraphrase of what the provision says. Rendered under the citation when a
   * step is opened.
   */
  locator: string;
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
    // The traditional-knowledge guidelines and the TKDL access model are here
    // rather than under a later step on purpose: for an Ayurvedic formulation
    // the traditional-knowledge search is part of the first search, not a check
    // performed after a draft exists.
    documents: [
      'in-patents-act-1970',
      'in-tk-biological-material-guidelines',
      'in-tkdl-access-model',
    ],
    locator: 'Patents Act 1970, s.2(1)(j), s.2(1)(l); TK and biological material guidelines',
    forms: [],
    tool: 'priorArt',
  },
  {
    id: 'patentability',
    phase: 'before',
    documents: ['in-patents-act-1970', 'in-tk-biological-material-guidelines'],
    locator: 'Patents Act 1970, s.3(d), s.3(e), s.3(p)',
    forms: [],
    tool: 'classify',
  },
  {
    id: 'drafting',
    phase: 'before',
    documents: ['in-patents-act-1970', 'in-patents-rules-2003'],
    locator: 'Patents Act 1970, s.9, s.10; Patents Rules 2003, r.13',
    forms: ['form2'],
    tool: null,
  },
  {
    id: 'filing',
    phase: 'filing',
    documents: ['in-patents-act-1970', 'in-patents-rules-2003'],
    locator: 'Patents Act 1970, s.6, s.7, s.8; Patents Rules 2003, First Schedule',
    forms: ['form1', 'form2', 'form3', 'form5', 'form26'],
    tool: null,
  },
  {
    id: 'complete',
    phase: 'filing',
    documents: ['in-patents-act-1970'],
    locator: 'Patents Act 1970, s.9(1)',
    forms: ['form2'],
    tool: null,
  },
  {
    id: 'publication',
    phase: 'filing',
    documents: ['in-patents-act-1970', 'in-patents-rules-2003'],
    locator: 'Patents Act 1970, s.11A; Patents Rules 2003, r.24A',
    forms: ['form9'],
    tool: null,
  },
  {
    id: 'examination',
    phase: 'examination',
    documents: ['in-patents-act-1970', 'in-patents-rules-2003'],
    locator: 'Patents Act 1970, s.11B; Patents Rules 2003, r.24B',
    forms: ['form18'],
    tool: null,
  },
  {
    id: 'fer',
    phase: 'examination',
    documents: ['in-patents-act-1970', 'in-patents-rules-2003', 'in-patent-office-manual'],
    locator: 'Patents Act 1970, s.21; Patents Rules 2003, r.24B(5)-(6)',
    forms: [],
    tool: null,
  },
  {
    id: 'hearing',
    phase: 'examination',
    documents: ['in-patents-act-1970', 'in-patent-office-manual'],
    locator: 'Patents Act 1970, s.14; Patents Rules 2003, r.28',
    forms: [],
    tool: null,
  },
  {
    id: 'grant',
    phase: 'after',
    documents: ['in-patents-act-1970'],
    locator: 'Patents Act 1970, s.43, s.44',
    forms: [],
    tool: null,
  },
  {
    id: 'opposition',
    phase: 'after',
    documents: ['in-patents-act-1970', 'in-patents-rules-2003'],
    locator: 'Patents Act 1970, s.25(1) and s.25(2); Patents Rules 2003, r.55, r.57',
    forms: [],
    tool: null,
  },
  {
    id: 'renewal',
    phase: 'after',
    documents: ['in-patents-act-1970', 'in-patents-rules-2003'],
    locator: 'Patents Act 1970, s.53; Patents Rules 2003, r.80',
    forms: [],
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
