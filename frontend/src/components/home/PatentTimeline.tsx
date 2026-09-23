import { ChevronRight, ListChecks, MessageSquareText, Search } from 'lucide-react';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { SectionSourceList, SourceScope, Src } from '@/components/sourcing/Sourced';
import { buttonStyles } from '@/components/ui';
import { cn } from '@/lib/cn';
import { sourceHost, verifiedDocument } from '@/services/verifiedSources';
import {
  askHref,
  PATENT_PHASES,
  PATENT_STEP_DOCUMENTS,
  PATENT_STEPS,
  toolHref,
  type PatentStep,
  type PatentStepId,
  type PatentStepTool,
} from '@/components/home/patentSteps';

/**
 * The route to a patent, as a rail the reader travels down — and, at each step,
 * the way into the part of Sahayak that handles it.
 *
 * Named for the shape rather than the content, and paired with `patentSteps.ts`
 * the way `PipelineDiagram` is paired with `pipelineStages` — the component
 * draws, the data file says what.
 *
 * **What moves, and why each thing does.** Every movement here reports the
 * reader's own progress; nothing moves while they are still.
 *
 *  - The rail fills to the reading line and a stylus rides its tip, so the
 *    reader can see where they are on the route at a glance.
 *  - A step arriving for the first time is incised: its seal's ring draws, a
 *    hairline reaches out to its card, and the card swings open from the rail
 *    like a leaf being turned, its lines settling in one after another.
 *  - The step at the reading line is pressed like a seal, once, and the pinned
 *    tracker above the list moves to its phase.
 *
 * The choreography lives in `structures.css` under `.route-*`, keyed off data
 * attributes set here — the component says what state a step is in, and the
 * stylesheet decides how that looks arriving. Every property animated is a
 * transform, an opacity or a stroke offset, so nothing relayouts.
 *
 * **Scroll is read once a frame, and only while the list is on screen.** An
 * `IntersectionObserver` on the list attaches a passive scroll listener as the
 * list comes into view and removes it as the list leaves. The listener batches
 * into one animation frame, writes the rail position straight onto the rail as
 * custom properties — no React render per frame — and only sets state when the
 * active or furthest-reached step actually changes.
 *
 * **What happens with JavaScript off, or with no IntersectionObserver.**
 * Everything renders, finished. The list, the copy, the citations, the links
 * into the workspace and the source list are all in the DOM, and the hidden
 * starting state is opted into only when an observer exists to undo it — see
 * `armed`. A reader who gets no animation gets the finished article instead of
 * an empty section, which is the right way round.
 *
 * **Reduced motion.** Every step counts as reached at once, so nothing is ever
 * hidden, and the global reduced-motion rule collapses what durations remain;
 * the stylus is not drawn at all.
 */

/** Where the reading line sits, as a fraction of the viewport's height. */
const READING_LINE = 0.5;
/** How far up the viewport a step must come before it is first revealed. */
const REVEAL_LINE = 0.86;

/** Circumference of a seal's ring, r = 15 — the stroke length to incise. */
const RING_LENGTH = 2 * Math.PI * 15;

type Style = React.CSSProperties & Record<`--${string}`, string | number>;

export function PatentTimeline({ className }: { className?: string }) {
  const { t } = useTranslation('home');
  const headingId = useId();

  /**
   * Whether anything is allowed to be hidden yet.
   *
   * This is the whole progressive-enhancement contract in one flag. The reveal
   * is an *opt-in*: a step is visible unless something is in a position to
   * un-hide it later. Computed synchronously in the initialiser rather than set
   * in an effect, so there is no first paint showing all twelve steps followed
   * by a flash as they hide.
   *
   * The failure this prevents is the one that matters: with JavaScript running
   * but `IntersectionObserver` unavailable — an older browser, a locked-down
   * webview, a test environment — an effect-driven version leaves every step at
   * `opacity: 0` permanently, and the section is simply blank forever.
   */
  const [armed] = useState(
    () => typeof window !== 'undefined' && typeof window.IntersectionObserver === 'function',
  );

  /** The furthest step revealed. Monotonic: a card, once opened, stays open. */
  const [reached, setReached] = useState<number>(-1);
  /** The step at the reading line. Follows the reader both ways. */
  const [active, setActive] = useState<number>(-1);
  const [openStep, setOpenStep] = useState<PatentStepId | null>(null);

  const listRef = useRef<HTMLDivElement>(null);
  const railRef = useRef<HTMLDivElement>(null);
  const sealRefs = useRef<(HTMLSpanElement | null)[]>([]);

  const setSealRef = useCallback(
    (index: number) => (node: HTMLSpanElement | null) => {
      sealRefs.current[index] = node;
    },
    [],
  );

  useEffect(() => {
    // `armed` is precisely "an IntersectionObserver exists to build". Without
    // one there is nothing to set up and nothing was ever hidden, so the
    // section is already in its finished state.
    if (!armed) return;
    const list = listRef.current;
    const rail = railRef.current;
    if (!list || !rail) return;

    // Guarded, because `matchMedia` is not universal — jsdom has no
    // implementation at all, and an unguarded call throws during commit and
    // takes the whole page down with it rather than just losing an animation.
    const prefersReduced =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced) setReached(PATENT_STEPS.length - 1);

    let frame = 0;
    const measure = () => {
      frame = 0;
      const box = list.getBoundingClientRect();
      const viewport = window.innerHeight;
      const line = viewport * READING_LINE;
      const progress = Math.min(1, Math.max(0, (line - box.top) / box.height));
      rail.style.setProperty('--route-fill', String(progress));
      rail.style.setProperty('--route-tip', `${(progress * box.height).toFixed(1)}px`);

      let nextActive = -1;
      let nextReached = -1;
      sealRefs.current.forEach((seal, index) => {
        if (!seal) return;
        const top = seal.getBoundingClientRect().top;
        if (top <= viewport * REVEAL_LINE) nextReached = index;
        if (top <= line) nextActive = index;
      });
      setReached((current) => Math.max(current, nextReached));
      setActive(nextActive);
    };
    const schedule = () => {
      if (frame === 0) frame = window.requestAnimationFrame(measure);
    };

    let listening = false;
    const listen = (on: boolean) => {
      if (on === listening) return;
      listening = on;
      if (on) {
        window.addEventListener('scroll', schedule, { passive: true });
        window.addEventListener('resize', schedule, { passive: true });
        schedule();
      } else {
        window.removeEventListener('scroll', schedule);
        window.removeEventListener('resize', schedule);
      }
    };

    const observer = new IntersectionObserver(
      (entries) => listen(entries.some((entry) => entry.isIntersecting)),
      { rootMargin: '10% 0px 10% 0px' },
    );
    observer.observe(list);

    return () => {
      observer.disconnect();
      listen(false);
      if (frame !== 0) window.cancelAnimationFrame(frame);
    };
  }, [armed]);

  return (
    <section aria-labelledby={headingId} className={cn('route', className)}>
      <div className="mx-auto max-w-[75rem] px-5 py-14">
        <h2 id={headingId} className="text-xl">
          {t('patentSteps.heading')}
        </h2>
        <p className="mt-3 max-w-measure text-muted">{t('patentSteps.standfirst')}</p>

        <SourceScope documentIds={PATENT_STEP_DOCUMENTS}>
          {/* The tracker sticks only while this wrapper is on screen, so it
              leaves with the list rather than following the reader down the
              rest of the page. */}
          <div className="mt-8">
            <PhaseTracker active={active} />

            <div ref={listRef} data-armed={armed ? 'true' : 'false'} className="relative mt-10">
              {/*
                The rail: a muted track, a leaf-coloured fill scaled from the top
                to the reading line, and the stylus riding the fill's tip. The
                position arrives as two custom properties written once a frame.
                `aria-hidden` because the same progress is already carried
                semantically by `aria-current` on the active step.
              */}
              <div
                ref={railRef}
                aria-hidden="true"
                className="absolute bottom-0 left-[19px] top-0 w-px bg-rule lg:left-1/2 lg:-translate-x-1/2"
              >
                <div className="route-fill h-full w-full origin-top bg-leaf" />
                <span className="route-tip" />
              </div>

              <ol aria-label={t('patentSteps.aria')} className="relative m-0 list-none p-0">
                {PATENT_STEPS.map((step, index) => (
                  <StepItem
                    key={step.id}
                    sealRef={setSealRef(index)}
                    index={index}
                    step={step}
                    total={PATENT_STEPS.length}
                    phaseStart={index === 0 || PATENT_STEPS[index - 1]!.phase !== step.phase}
                    state={
                      index === active
                        ? 'active'
                        : index < active
                          ? 'passed'
                          : index <= reached
                            ? 'reached'
                            : 'upcoming'
                    }
                    revealed={!armed || index <= reached}
                    open={openStep === step.id}
                    onToggle={() =>
                      setOpenStep((current) => (current === step.id ? null : step.id))
                    }
                  />
                ))}
              </ol>
            </div>
          </div>

          <SectionSourceList className="mt-12" />
        </SourceScope>
      </div>
    </section>
  );
}

/**
 * Where the reader is on the route, pinned above the list while it scrolls.
 *
 * Four segments, one per phase, each filling as its own steps pass the reading
 * line. On a phone the segments are bare and the current phase is named above
 * them; from `md` up each segment carries its own label. `aria-hidden` for the
 * same reason the rail is: `aria-current` on the active step already says it.
 *
 * Opaque by construction — bone with the sunk surface laid over it, the same
 * two layers the section itself is painted with — because the sunk surface is
 * translucent, and a translucent pinned bar lets the page show through it.
 */
function PhaseTracker({ active }: { active: number }) {
  const { t } = useTranslation('home');
  const current = active >= 0 ? PATENT_STEPS[active]!.phase : null;

  return (
    <div aria-hidden="true" className="sticky top-0 z-20 -mx-5 bg-bone">
      <div className="flex items-center gap-4 border-b border-rule bg-surface-sunk px-5 py-3">
        <div className="min-w-0 flex-1">
          <p className="mb-2 max-w-none overflow-hidden text-xs md:hidden">
            <span
              key={current ?? 'none'}
              className={cn(
                'route-swap inline-block',
                current ? 'font-medium text-ink' : 'text-muted',
              )}
            >
              {t(`patentSteps.phases.${current ?? PATENT_PHASES[0]!}`)}
            </span>
          </p>

          <div className="grid grid-cols-4 gap-1.5 md:gap-4">
            {PATENT_PHASES.map((phase) => {
              const indices = PATENT_STEPS.flatMap((step, index) =>
                step.phase === phase ? [index] : [],
              );
              const done = indices.filter((index) => index <= active).length;
              return (
                <div key={phase} className="min-w-0">
                  <div className="h-[3px] overflow-hidden rounded-seal bg-rule">
                    <div
                      className="route-segment h-full w-full origin-left bg-leaf"
                      style={{ transform: `scaleX(${done / indices.length})` }}
                    />
                  </div>
                  <p
                    className={cn(
                      'mt-2 hidden max-w-none truncate text-xs transition-colors duration-panel ease-incise md:block',
                      phase === current ? 'font-medium text-ink' : 'text-muted',
                    )}
                  >
                    {t(`patentSteps.phases.${phase}`)}
                  </p>
                </div>
              );
            })}
          </div>
        </div>

        <p className="w-[5.5rem] shrink-0 overflow-hidden text-right text-xs tabular-nums text-muted">
          {active >= 0 ? (
            <span key={active} className="route-swap inline-block">
              {t('patentSteps.stepOf', { number: active + 1, total: PATENT_STEPS.length })}
            </span>
          ) : null}
        </p>
      </div>
    </div>
  );
}

type StepState = 'upcoming' | 'reached' | 'active' | 'passed';

interface StepItemProps {
  /**
   * The seal's callback ref, which the scroll measure reads. Deliberately *not*
   * called `ref`: React 18 strips `ref` from props and hands it only to
   * `forwardRef`, so a plain function component destructuring `{ ref }`
   * receives undefined and the measure would see no steps at all.
   */
  sealRef: (node: HTMLSpanElement | null) => void;
  index: number;
  step: PatentStep;
  total: number;
  /** The first step of its phase carries the phase's marker on the rail. */
  phaseStart: boolean;
  state: StepState;
  revealed: boolean;
  open: boolean;
  onToggle: () => void;
}

const TOOL_ICONS: Record<PatentStepTool, typeof Search> = {
  priorArt: Search,
  classify: ListChecks,
};

/** A cascade position inside a card, as the custom property the stylesheet reads. */
const at = (position: number): Style => ({ '--i': position });

/**
 * One step.
 *
 * Alternating sides from `lg` up, a single column with the rail on the left
 * below it — two columns of cards on a tablet would each be too narrow to read.
 * The alternation is done with grid column placement rather than by reordering
 * the list, so the DOM order stays the reading order — a left/right layout that
 * reorders the markup reads as 1, 3, 5, 2, 4, 6 to a screen reader.
 */
function StepItem({
  sealRef,
  index,
  step,
  total,
  phaseStart,
  state,
  revealed,
  open,
  onToggle,
}: StepItemProps) {
  const { t } = useTranslation('home');
  const panelId = useId();
  const titleId = useId();
  const side = index % 2 === 1 ? 'end' : 'start';
  const ToolIcon = step.tool ? TOOL_ICONS[step.tool] : null;
  const lit = state === 'active' || state === 'passed';

  return (
    <li
      data-index={index}
      data-state={state}
      data-revealed={revealed ? 'true' : 'false'}
      data-side={side}
      aria-current={state === 'active' ? 'step' : undefined}
      className={cn(phaseStart && index > 0 ? 'pt-12' : 'pt-6', 'first:pt-0')}
    >
      {phaseStart ? (
        // Not a heading: each step owns exactly one, and a phase is a grouping
        // for reading rather than a section of its own. Bone under the sunk
        // surface, so the pill is opaque and the rail passes behind it.
        <p className="route-phase relative z-10 mb-6 max-w-none lg:flex lg:justify-center">
          <span className="inline-flex rounded-control bg-bone">
            <span
              className={cn(
                'rounded-control border bg-surface-sunk px-3 py-1 text-xs font-medium',
                'transition-colors duration-panel ease-incise',
                lit ? 'border-leaf text-ink' : 'border-rule-strong text-muted',
              )}
            >
              {t(`patentSteps.phases.${step.phase}`)}
            </span>
          </span>
        </p>
      ) : null}

      <div className="relative pl-12 lg:grid lg:grid-cols-2 lg:gap-x-20 lg:pl-0">
        <Seal number={index + 1} sealRef={sealRef} />
        {/* The hairline from the seal out to the card. */}
        <span aria-hidden="true" className="route-link" />

        <div
          className={cn(
            'route-card relative rounded-data border bg-surface p-4 sm:p-5',
            state === 'active' ? 'border-leaf' : 'border-rule',
            side === 'end' ? 'lg:col-start-2 lg:mr-auto' : 'lg:col-start-1 lg:ml-auto',
            'lg:w-full lg:max-w-[33rem]',
          )}
        >
          <p
            className={cn(
              'route-rise text-xs tabular-nums transition-colors duration-panel ease-incise',
              state === 'active' ? 'text-leaf' : 'text-muted',
            )}
            style={at(0)}
          >
            {t('patentSteps.stepOf', { number: index + 1, total })}
          </p>

          {/* The title rises out of its own line rather than fading in over it. */}
          <h3 id={titleId} className="mt-1 overflow-hidden text-md leading-snug">
            <span className="route-rise route-rise--line block" style={at(1)}>
              {t(`patentSteps.steps.${step.id}.title`)}
            </span>
          </h3>

          <p className="route-rise mt-2 max-w-measure text-muted" style={at(2)}>
            {t(`patentSteps.steps.${step.id}.body`)}
            {step.documents.map((id) => (
              <Src key={id} doc={id} />
            ))}
          </p>
          <p className="route-rise mt-2 max-w-measure text-xs" style={at(2)}>
            <span className="text-ink">{t('patentSteps.whereLabel')}: </span>
            <span className="text-muted">{t(`patentSteps.steps.${step.id}.where`)}</span>
          </p>

          {/* The hand-off. Every link here opens something the workspace really
              does: a tool it renders, or the question as a reader would ask it. */}
          <div className="route-handoff relative mt-5 pl-4">
            <p className="route-rise max-w-none text-xs font-medium text-ink" style={at(3)}>
              {t('patentSteps.sahayakLabel')}
            </p>
            <p className="route-rise mt-1 max-w-measure text-xs text-muted" style={at(4)}>
              {t(`patentSteps.handoff.${step.tool ?? 'ask'}`)}
            </p>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              {step.tool && ToolIcon ? (
                <Link
                  to={toolHref(step.tool)}
                  aria-describedby={titleId}
                  style={at(5)}
                  className={buttonStyles({
                    size: 'sm',
                    className: 'route-pop min-h-[44px] sm:min-h-[36px] active:scale-[0.98]',
                  })}
                >
                  <ToolIcon size={14} aria-hidden="true" />
                  {t(`patentSteps.actions.${step.tool}`)}
                </Link>
              ) : null}
              <Link
                to={askHref(t(`patentSteps.questions.${step.id}`))}
                aria-describedby={titleId}
                style={at(step.tool ? 6 : 5)}
                className={buttonStyles({
                  variant: 'secondary',
                  size: 'sm',
                  className:
                    'route-pop min-h-[44px] bg-surface sm:min-h-[36px] active:scale-[0.98]',
                })}
              >
                <MessageSquareText size={14} aria-hidden="true" />
                {t('patentSteps.actions.ask')}
              </Link>
            </div>
          </div>

          <button
            type="button"
            aria-expanded={open}
            aria-controls={panelId}
            onClick={onToggle}
            style={at(7)}
            className="route-rise mt-3 inline-flex min-h-[44px] items-center gap-1 rounded-data text-xs text-muted
              transition-colors duration-quick ease-incise hover:text-leaf sm:min-h-[32px]"
          >
            <ChevronRight
              size={13}
              aria-hidden="true"
              className="transition-transform duration-quick ease-incise"
              style={{ transform: open ? 'rotate(90deg)' : 'none' }}
            />
            {open ? t('patentSteps.collapse') : t('patentSteps.expand')}
          </button>

          {/*
            Always rendered, hidden with the `hidden` attribute rather than
            unmounted: the citation and the forms are content, and content a
            reader can only reach by running JavaScript is not really there.
          */}
          <div
            id={panelId}
            hidden={!open}
            className="route-panel mt-2 rounded-control border border-rule bg-surface-sunk p-3 text-xs"
          >
            <p className="max-w-none text-muted">
              <span className="text-ink">{t('patentSteps.sourceLabel')}: </span>
              {step.locator}
            </p>

            <div className="mt-2">
              <p className="max-w-none text-ink">{t('patentSteps.officialLabel')}</p>
              {/* Plain blocks rather than a nested list: the steps are the list. */}
              {step.official.map((id) => {
                const doc = verifiedDocument(id);
                return (
                  <p key={id} className="mt-1 max-w-none">
                    <a
                      href={doc.source_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-stamp underline underline-offset-4"
                    >
                      {doc.document_title}
                    </a>
                    <span className="text-muted"> · {sourceHost(doc.source_url)}</span>
                  </p>
                );
              })}
            </div>

            {step.forms.length > 0 ? (
              <div className="mt-2">
                <p className="max-w-none text-ink">{t('patentSteps.formsLabel')}</p>
                <p className="mt-1.5 flex max-w-none flex-wrap gap-1.5">
                  {step.forms.map((form, formIndex) => (
                    <span
                      key={form}
                      className="rounded-control border border-rule-strong bg-surface px-2 py-0.5 text-ink"
                    >
                      {t(`patentSteps.forms.${form}`)}
                      {formIndex < step.forms.length - 1 ? (
                        <span className="sr-only">, </span>
                      ) : null}
                    </span>
                  ))}
                </p>
              </div>
            ) : null}

            <p className="mt-2 max-w-none text-muted">{t('patentSteps.notRetrieved')}</p>
          </div>
        </div>
      </div>
    </li>
  );
}

/**
 * A step's seal on the rail: its number, inside a ring that is incised when the
 * step is first reached, pressed with a single impression ring when it becomes
 * the active step, and filled while it is.
 */
function Seal({
  number,
  sealRef,
}: {
  number: number;
  sealRef: (node: HTMLSpanElement | null) => void;
}) {
  return (
    <span
      ref={sealRef}
      aria-hidden="true"
      className="absolute left-[3px] top-4 z-10 h-8 w-8 lg:left-1/2 lg:-ml-4"
    >
      <span className="route-ripple" />
      <span className="route-seal">
        <svg viewBox="0 0 32 32" className="absolute inset-0 -rotate-90" fill="none">
          <circle cx="16" cy="16" r="15" stroke="var(--rule-strong)" strokeWidth="1" />
          <circle
            className="route-ring"
            cx="16"
            cy="16"
            r="15"
            stroke="rgb(var(--leaf-rgb))"
            strokeWidth="1.5"
            style={{ '--len': RING_LENGTH } as Style}
          />
        </svg>
        <span className="route-seal-number">{number}</span>
      </span>
    </span>
  );
}
