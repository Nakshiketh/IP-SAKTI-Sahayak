import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { PIPELINE_STAGES, STAGE_FIELDS } from '@/components/howitworks/pipelineStages';
import { BuildStateBadge } from '@/components/ui';
import { cn } from '@/lib/cn';

/**
 * The pipeline, as something you interrogate rather than watch.
 *
 * It advances on selection, never on a timer: a diagram that animates itself is
 * showing off, and a reader assessing the engineering wants to stop on one stage
 * and read what happens when it fails.
 *
 * A vertical tablist with a roving tabindex — one stop in the tab order, arrow
 * keys to move, Home and End to the ends. Thirteen buttons each in the tab order
 * would make the rest of the page unreachable by keyboard in any reasonable
 * number of presses.
 *
 * Every stage carries its build state, and all but the last are `planned`. That
 * is the honest position and this page is the wrong place to blur it.
 */

export function PipelineDiagram({ idBase }: { idBase: string }) {
  const { t } = useTranslation('howitworks');
  const [selected, setSelected] = useState(PIPELINE_STAGES[0]!.id);
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});

  function onKeyDown(event: React.KeyboardEvent) {
    const index = PIPELINE_STAGES.findIndex((stage) => stage.id === selected);
    if (index === -1) return;
    let next = index;
    if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
      next = (index + 1) % PIPELINE_STAGES.length;
    } else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
      next = (index - 1 + PIPELINE_STAGES.length) % PIPELINE_STAGES.length;
    } else if (event.key === 'Home') {
      next = 0;
    } else if (event.key === 'End') {
      next = PIPELINE_STAGES.length - 1;
    } else {
      return;
    }
    event.preventDefault();
    const target = PIPELINE_STAGES[next]!;
    setSelected(target.id);
    refs.current[target.id]?.focus();
  }

  const active = PIPELINE_STAGES.find((stage) => stage.id === selected)!;

  const plannedCount = PIPELINE_STAGES.filter((stage) => stage.state === 'planned').length;

  return (
    <div className="grid gap-8 lg:grid-cols-[18rem_1fr]">
      <div>
        {/*
          The list carries the count, because the page's most important message
          is how little of this runs — and a reader should not have to click
          thirteen stages to discover it.
        */}
        <p className="mb-3 max-w-none text-xs text-muted">
          {t('pipeline.buildSummary', {
            planned: plannedCount,
            total: PIPELINE_STAGES.length,
          })}
        </p>
        <div
          role="tablist"
          aria-orientation="vertical"
          aria-label={t('pipeline.listLabel')}
          onKeyDown={onKeyDown}
          className="m-0 list-none p-0"
        >
          {PIPELINE_STAGES.map((stage, index) => {
            const isSelected = stage.id === selected;
            return (
              <button
                key={stage.id}
                ref={(node) => {
                  refs.current[stage.id] = node;
                }}
                role="tab"
                id={`${idBase}-stage-${stage.id}`}
                aria-selected={isSelected}
                aria-controls={`${idBase}-detail`}
                tabIndex={isSelected ? 0 : -1}
                onClick={() => setSelected(stage.id)}
                className={cn(
                  'flex w-full items-baseline gap-3 border-l-2 py-2 pl-3 pr-2 text-left',
                  'transition-colors duration-quick ease-incise',
                  isSelected
                    ? 'border-leaf bg-surface-sunk text-ink'
                    : 'border-rule text-muted hover:border-rule-strong hover:text-ink',
                )}
              >
                {/* Numbered because this genuinely is a sequence — one of the two
                  places in the product where numbering carries meaning. */}
                <span className="shrink-0 tabular-nums text-xs text-muted">{index + 1}</span>
                <span className="text-base">{t(`pipeline.stages.${stage.id}.name`)}</span>
                {stage.state === 'planned' ? null : (
                  <span className="ml-auto shrink-0">
                    <BuildStateBadge state={stage.state} />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div
        role="tabpanel"
        id={`${idBase}-detail`}
        aria-labelledby={`${idBase}-stage-${active.id}`}
        tabIndex={0}
        className="rounded-data border border-rule bg-surface p-5"
      >
        <div className="flex flex-wrap items-center gap-3">
          <h3 className="text-md">{t(`pipeline.stages.${active.id}.name`)}</h3>
          <BuildStateBadge state={active.state} />
        </div>

        <dl className="m-0 mt-4">
          {STAGE_FIELDS.map((field) => (
            <div
              key={field}
              className="border-t border-rule-faint py-3 first:border-t-0 first:pt-0"
            >
              <dt className="text-xs text-muted">{t(`pipeline.${field}`)}</dt>
              <dd className="m-0 mt-1 max-w-measure">
                {t(`pipeline.stages.${active.id}.${field}`)}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
