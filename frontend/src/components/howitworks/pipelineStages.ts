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

/** In pipeline order. The order is the content. */
export const PIPELINE_STAGES: readonly PipelineStage[] = [
  { id: 'detect', state: 'planned' },
  { id: 'understand', state: 'planned' },
  { id: 'clarify', state: 'planned' },
  { id: 'route', state: 'planned' },
  { id: 'retrieve', state: 'planned' },
  { id: 'rerank', state: 'planned' },
  { id: 'context', state: 'planned' },
  { id: 'generate', state: 'planned' },
  { id: 'map', state: 'planned' },
  { id: 'confidence', state: 'planned' },
  { id: 'abstain', state: 'planned' },
  { id: 'translate', state: 'planned' },
  { id: 'render', state: 'demo' },
];

/** The three things each stage is described by, in the order they are shown. */
export const STAGE_FIELDS = ['does', 'outputs', 'fails'] as const;
