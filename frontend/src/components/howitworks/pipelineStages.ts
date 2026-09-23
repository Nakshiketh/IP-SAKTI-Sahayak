import type { BuildState } from '@/components/ui';

/**
 * Stage ids are a literal union, not `string`, so `t('pipeline.stages.' + id)`
 * typechecks. A stage added here without matching copy fails the build rather
 * than rendering a raw key.
 */
export type StageId =
  | 'detect'
  | 'understand'
  | 'clarify'
  | 'route'
  | 'retrieve'
  | 'rerank'
  | 'context'
  | 'generate'
  | 'map'
  | 'confidence'
  | 'abstain'
  | 'translate'
  | 'render';

export interface PipelineStage {
  id: StageId;
  state: BuildState;
}

/**
 * In pipeline order. The order is the content.
 *
 * The three states mean exactly what the badge says. `live` is a stage whose
 * output does not depend on the corpus, so it is as real now as it will ever
 * be: reading the question, deciding what it is about, choosing a namespace,
 * rendering the answer. `demo` is a stage that runs in full but over the
 * committed fixture store, so what it produces is illustrative until documents
 * are ingested. `planned` is a stage with an interface and no implementation
 * behind it — translation has a passthrough that reports it translated nothing,
 * which is not the same as translating.
 */
export const PIPELINE_STAGES: readonly PipelineStage[] = [
  { id: 'detect', state: 'live' },
  { id: 'understand', state: 'live' },
  { id: 'clarify', state: 'live' },
  { id: 'route', state: 'live' },
  { id: 'retrieve', state: 'live' },
  { id: 'rerank', state: 'live' },
  { id: 'context', state: 'live' },
  { id: 'generate', state: 'live' },
  { id: 'map', state: 'live' },
  { id: 'confidence', state: 'live' },
  { id: 'abstain', state: 'live' },
  { id: 'translate', state: 'planned' },
  { id: 'render', state: 'live' },
];

/** The three things each stage is described by, in the order they are shown. */
export const STAGE_FIELDS = ['does', 'outputs', 'fails'] as const;
