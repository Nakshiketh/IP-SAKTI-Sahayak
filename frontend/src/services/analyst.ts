import type { ProtectionEntry } from '@/components/answer/ProtectionMap';
import { readStoredSession } from '@/services/auth';

/**
 * The invention analyst, from the API.
 *
 * Every request carries the signed-in account's token: an analysis belongs to an
 * account and the API refuses anyone else. A turn is streamed as newline-delimited
 * JSON, so the analysis journey on the page reports stages as they actually finish
 * rather than animating a guess.
 */

export type Indicator =
  'nothing_found_in_sources_searched' | 'related_material_found' | 'match_in_public_sources';
export type Level = 'high' | 'moderate' | 'low';
export type StageId =
  'understand' | 'extract' | 'products' | 'knowledge' | 'prior_art' | 'compare' | 'assess';

export const STAGE_IDS: readonly StageId[] = [
  'understand',
  'extract',
  'products',
  'knowledge',
  'prior_art',
  'compare',
  'assess',
];

export interface Reason {
  code: string;
  params: Record<string, unknown>;
  basis: 'evidence' | 'interpretation';
}

export interface Amount {
  value: number;
  unit: string;
}

export interface Ingredient {
  key: string;
  name: string;
  vocabulary_id: string | null;
  label: string | null;
  kind: 'traditional' | 'material' | 'excipient' | 'unrecognised';
  amount: Amount | null;
  percent: number | null;
  percent_derived: number | null;
  purpose: string | null;
}

export interface Invention {
  title: string | null;
  invention_type: string | null;
  form: string | null;
  category: string | null;
  intended_use: string | null;
  use_terms: string[];
  problem: string | null;
  ingredients: Ingredient[];
  batch_size: Amount | null;
  process_steps: string[];
  process_parameters: string[];
  distinctive_features: string[];
  technical_effects: string[];
  evidence: string | null;
  disclosure: 'public' | 'confidential' | null;
  brand_name: string | null;
  packaging_note: string | null;
  region_note: string | null;
  /** Classical texts the formulation is said to come from, as TKDL names them. */
  source_texts?: string[];
  version: number;
}

export interface Source {
  url: string;
  publisher: string;
  kind: string;
  retrieved_at: string;
  excerpt: string;
}

export interface ComparisonRow {
  key: string;
  label: string;
  status: 'common' | 'added' | 'removed';
  user_name: string | null;
  user_percent: number | null;
  user_amount: string | null;
  product_name: string | null;
  product_percent: number | null;
  product_amount: string | null;
  difference: 'higher' | 'lower' | 'same' | 'unknown' | null;
}

export interface ProductMatch {
  product_id: string;
  name: string;
  brand: string | null;
  manufacturer: string | null;
  product_form: string;
  stated_use: string[];
  ingredient_list_scope: string;
  level: Level;
  shared: string[];
  shared_count: number;
  user_count: number;
  product_active_count: number;
  base_ingredients: string[];
  same_form: boolean;
  shared_uses: string[];
  rows: ComparisonRow[];
  notes: Reason[];
  sources: Source[];
}

export interface ProductsFinding {
  state: 'searched' | 'unavailable';
  dataset_size: number;
  dataset_version: string;
  retrieved_at: string;
  matches: ProductMatch[];
  weaker: ProductMatch[];
}

export interface KnowledgeFinding {
  reference_size: number;
  formulation_count: number;
  ingredients: {
    key: string;
    name: string;
    label: string | null;
    recognised: 'traditional' | 'material' | 'unrecognised';
  }[];
  traditional_count: number;
  classical: { id: string; label: string; via: 'name' | 'ingredients' }[];
  tkdl_searched: false;
  /** Public TKDL references only; the TKDL database itself is never searched. */
  tkdl?: TkdlFinding | null;
  notes: Reason[];
}

export interface TkdlFinding {
  texts: { name: string; system: string; author: string | null; list_url: string }[];
  book_count: number;
  links: { id: string; title: string; url: string }[];
  retrieved_on: string;
}

export interface PatentMatch {
  record_id: string;
  title: string;
  record_type: string;
  jurisdiction: string;
  applicant: string | null;
  filing_date: string | null;
  publication_date: string | null;
  status: string | null;
  abstract: string | null;
  level: Level;
  matched_ingredients: string[];
  matched_uses: string[];
  why: Reason[];
  citable_in_answers: false;
}

export interface PriorArtFinding {
  state: 'searched' | 'not_loaded' | 'failed';
  record_count: number;
  searched_terms: string[];
  matches: PatentMatch[];
  registries_not_searched: {
    name: string;
    publisher: string;
    jurisdiction: string;
    record_type: string;
  }[];
}

export interface RequirementView {
  status: string;
  reasons: Reason[];
}

export interface Assessment {
  indicator: Indicator;
  reasons: Reason[];
  novelty: RequirementView;
  inventive_step: RequirementView;
  industrial_applicability: RequirementView;
  exclusions: Reason[];
  would_sharpen: string[];
}

export interface IpOption {
  type: 'patent' | 'trademark' | 'design' | 'copyright' | 'gi' | 'trade_secret';
  relevance: 'relevant' | 'possible' | 'not_indicated';
  reasons: Reason[];
}

/**
 * The source-grounded half of the product check.
 *
 * Optional because a run stored before this existed still has to load. Only
 * the parts the interface reads are declared; the rest arrives and is ignored
 * rather than being mirrored here for its own sake.
 */
export interface Intelligence {
  protection: ProtectionEntry[];
}

export interface Analysis {
  created_at: number;
  invention_version: number;
  trigger: string;
  reran: string[];
  products: ProductsFinding;
  knowledge: KnowledgeFinding;
  prior_art: PriorArtFinding;
  assessment: Assessment;
  ip_options: IpOption[];
  next_steps: Reason[];
  intelligence?: Intelligence | null;
}

export interface Message {
  id: number;
  role: 'user' | 'assistant';
  text: string;
  created_at: number;
  meta: {
    suggestions?: string[];
    asking?: string;
    analysis?: boolean;
    ask_link?: boolean;
    via?: string;
  };
}

export interface RunSummary {
  id: number;
  created_at: number;
  trigger: string;
  indicator: Indicator;
  product_matches: number;
  patent_matches: number;
}

export interface ConversationSummary {
  id: string;
  title: string;
  created_at: number;
  updated_at: number;
  indicator: Indicator | null;
  ingredient_count: number;
}

export interface Conversation {
  id: string;
  title: string;
  created_at: number;
  updated_at: number;
  invention: Invention;
  messages: Message[];
  analysis: Analysis | null;
  missing: string[];
  ready: boolean;
  history: RunSummary[];
  engine: 'rules' | 'model';
}

export interface AnalystStatus {
  engine: 'rules' | 'model';
  products: { count: number; retrieved_at: string };
  records: { available: boolean; count: number };
  traditional_reference: number;
}

export interface IngredientEdit {
  name: string;
  percent: number | null;
  amount_value: number | null;
  amount_unit: string | null;
  purpose: string | null;
}

export interface InventionEdit {
  ingredients?: IngredientEdit[];
  title?: string;
  intended_use?: string;
  problem?: string;
}

export type TurnInput = { text: string } | { edit: InventionEdit } | { rerun: true };

export interface StageEvent {
  id: StageId;
  ran: boolean;
  ms: number;
}

export type AnalystErrorCode = 'unreachable' | 'session' | 'rate_limited' | 'not_found' | 'unknown';

export class AnalystError extends Error {
  readonly code: AnalystErrorCode;

  constructor(code: AnalystErrorCode) {
    super(code);
    this.name = 'AnalystError';
    this.code = code;
  }
}

function toCode(status: number): AnalystErrorCode {
  if (status === 401 || status === 403) return 'session';
  if (status === 404) return 'not_found';
  if (status === 429) return 'rate_limited';
  return 'unknown';
}

function headers(extra: Record<string, string> = {}): Record<string, string> {
  const session = readStoredSession();
  return session ? { ...extra, Authorization: `Bearer ${session.token}` } : extra;
}

async function call<T>(path: string, method = 'GET'): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, { method, headers: headers() });
  } catch {
    throw new AnalystError('unreachable');
  }
  if (!response.ok) throw new AnalystError(toCode(response.status));
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

const BASE = '/api/v1/analyst';

export const getStatus = () => call<AnalystStatus>(`${BASE}/status`);
export const listConversations = () => call<ConversationSummary[]>(`${BASE}/conversations`);
export const createConversation = () => call<Conversation>(`${BASE}/conversations`, 'POST');
export const getConversation = (id: string) =>
  call<Conversation>(`${BASE}/conversations/${encodeURIComponent(id)}`);
export const deleteConversation = (id: string) =>
  call<void>(`${BASE}/conversations/${encodeURIComponent(id)}`, 'DELETE');

export async function sendTurn(
  id: string,
  input: TurnInput,
  onStage: (stage: StageEvent) => void,
  signal?: AbortSignal,
): Promise<Conversation> {
  const base = `${BASE}/conversations/${encodeURIComponent(id)}`;
  const path =
    'text' in input ? `${base}/messages` : 'edit' in input ? `${base}/edit` : `${base}/analyse`;
  const init: RequestInit = {
    method: 'POST',
    headers: headers({ 'content-type': 'application/json' }),
  };
  if ('text' in input) init.body = JSON.stringify({ text: input.text });
  else if ('edit' in input) init.body = JSON.stringify(input.edit);
  if (signal) init.signal = signal;

  let response: Response;
  try {
    response = await fetch(path, init);
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new AnalystError('unreachable');
  }
  if (!response.ok) throw new AnalystError(toCode(response.status));
  if (!response.body) throw new AnalystError('unknown');

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffered = '';
  let result: Conversation | null = null;

  const handle = (line: string) => {
    const message = JSON.parse(line) as
      | ({ event: 'stage' } & StageEvent)
      | { event: 'error'; code: string }
      | { event: 'result'; conversation: Conversation };
    if (message.event === 'stage') onStage({ id: message.id, ran: message.ran, ms: message.ms });
    else if (message.event === 'error') throw new AnalystError('unknown');
    else result = message.conversation;
  };

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffered += decoder.decode(value, { stream: true });
    let newline = buffered.indexOf('\n');
    while (newline !== -1) {
      const line = buffered.slice(0, newline).trim();
      buffered = buffered.slice(newline + 1);
      if (line) handle(line);
      newline = buffered.indexOf('\n');
    }
  }
  if (buffered.trim()) handle(buffered.trim());
  if (result === null) throw new AnalystError('unknown');
  return result;
}
