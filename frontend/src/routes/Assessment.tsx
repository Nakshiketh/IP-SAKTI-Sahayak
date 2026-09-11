import { ArrowLeft, ArrowRight, Printer, RotateCcw } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ErrorSummary } from '@/components/assessment/fields';
import { GuidanceView } from '@/components/assessment/GuidanceStep';
import {
  CategoryStep,
  DetailsStep,
  IngredientsStep,
  ProtectionStep,
  type StepProps,
} from '@/components/assessment/InputSteps';
import { CHECKS, type CheckId } from '@/components/assessment/checks';
import { ResultView, RunningChecks } from '@/components/assessment/ResultStep';
import { Stepper } from '@/components/assessment/Stepper';
import { Badge, Button } from '@/components/ui';
import { useDocumentMeta } from '@/hooks/useDocumentMeta';
import {
  allTerms,
  assess,
  EMPTY_INPUT,
  searchTerms,
  STEPS,
  validate,
  type Assessment as AssessmentResult,
  type AssessmentInput,
  type Errors,
  type RecordsOutcome,
} from '@/services/assessment';
import { searchRecords } from '@/services/records';

/**
 * Check my product: four questions, then the result, then the routes.
 *
 * Answers live in this tab's session storage and nowhere else. Running the
 * check sends only the search words `searchTerms` picks — never the
 * formulation details. Every rule about what can honestly be said back is in
 * `services/assessment`; this page only moves the reader through it.
 */

const STORAGE_KEY = 'sahayak.assessment';
const RESULT = STEPS.indexOf('result');
const GUIDANCE = STEPS.indexOf('guidance');

/** A short pause per check, so each tick is something a reader can see happen. */
const CHECK_PAUSE = 160;

const FIELD_LABELS: Record<string, string> = {
  category: 'steps.category',
  name: 'details.name',
  purpose: 'details.purpose',
  problem: 'details.problem',
  difference: 'details.difference',
  users: 'details.users',
  ingredients: 'ingredients.inputLabel',
  formulation: 'ingredients.formulation',
  novelty: 'ingredients.noveltyQuestion',
  brand: 'protection.brand',
  disclosed: 'protection.disclosed',
};

interface Saved {
  input: AssessmentInput;
  step: number;
  reached: number;
}

function load(): Saved {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (raw) {
      const saved = JSON.parse(raw) as Saved;
      // A saved result is not restored: it would be a result nobody re-ran.
      const step = Math.min(saved.step, RESULT - 1);
      return { input: { ...EMPTY_INPUT, ...saved.input }, step, reached: Math.min(saved.reached, step) };
    }
  } catch {
    // Storage blocked or corrupt: start fresh.
  }
  return { input: EMPTY_INPUT, step: 0, reached: 0 };
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export default function Assessment() {
  const { t } = useTranslation('assessment');
  useDocumentMeta(t('meta.title'), t('meta.description'));

  const [initial] = useState(load);
  const [input, setInput] = useState<AssessmentInput>(initial.input);
  const [step, setStep] = useState(initial.step);
  const [reached, setReached] = useState(initial.reached);
  const [direction, setDirection] = useState<'forward' | 'back'>('forward');
  const [errors, setErrors] = useState<Errors>({});
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState<CheckId[]>([]);
  const [result, setResult] = useState<AssessmentResult | null>(null);

  const headingRef = useRef<HTMLHeadingElement>(null);
  const summaryRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const firstRender = useRef(true);

  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ input, step, reached }));
    } catch {
      // Not remembered across a reload; everything else still works.
    }
  }, [input, step, reached]);

  // A new step, or the result arriving, takes focus to its heading — but not
  // on the first render, where focus belongs to the page.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    headingRef.current?.focus();
  }, [step, running]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const stepId = STEPS[step]!;

  const update = useCallback(
    (patch: Partial<AssessmentInput>) => {
      setInput((previous) => {
        const next = { ...previous, ...patch };
        // Errors clear as they are fixed; new ones wait for the next Continue.
        setErrors((current) => {
          const still = validate(stepId, next);
          return Object.fromEntries(Object.keys(current).filter((k) => still[k]).map((k) => [k, still[k]]));
        });
        return next;
      });
      // A changed answer makes any earlier result stale.
      if (result) {
        setResult(null);
        setReached(step);
      }
    },
    [result, step, stepId],
  );

  function go(index: number) {
    setDirection(index < step ? 'back' : 'forward');
    setErrors({});
    setStep(index);
  }

  async function run(current: AssessmentInput) {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setRunning(true);
    setDone([]);
    setResult(null);

    let records: RecordsOutcome;
    const terms = allTerms(searchTerms(current));
    try {
      const found = await searchRecords(terms.join(' '), {
        matchAny: true,
        limit: 50,
        signal: controller.signal,
      });
      records =
        found.recordCount === 0
          ? { state: 'empty', recordCount: 0, records: [] }
          : { state: 'searched', recordCount: found.recordCount, records: found.records };
    } catch {
      if (controller.signal.aborted) return;
      records = { state: 'failed', recordCount: 0, records: [] };
    }

    for (const check of CHECKS) {
      await wait(CHECK_PAUSE);
      if (controller.signal.aborted) return;
      setDone((previous) => [...previous, check]);
    }

    setResult(assess(current, records));
    setRunning(false);
  }

  function next() {
    const found = validate(stepId, input);
    if (Object.keys(found).length > 0) {
      setErrors(found);
      requestAnimationFrame(() => summaryRef.current?.focus());
      return;
    }
    setErrors({});
    const target = step + 1;
    setDirection('forward');
    setStep(target);
    setReached((r) => Math.max(r, target));
    if (target === RESULT) void run(input);
  }

  function restart() {
    abortRef.current?.abort();
    setInput(EMPTY_INPUT);
    setResult(null);
    setRunning(false);
    setDone([]);
    setErrors({});
    setReached(0);
    setDirection('back');
    setStep(0);
  }

  const summaryItems = Object.entries(errors).flatMap(([field, code]) =>
    code
      ? [
          {
            id: `field-${field}`,
            message: `${t((FIELD_LABELS[field] ?? 'steps.category') as 'steps.category')}: ${t(`errors.${code}`)}`,
          },
        ]
      : [],
  );

  const stepProps: StepProps = { input, update, errors, headingRef };

  let body: React.ReactNode;
  if (stepId === 'category') body = <CategoryStep {...stepProps} />;
  else if (stepId === 'details') body = <DetailsStep {...stepProps} />;
  else if (stepId === 'ingredients') body = <IngredientsStep {...stepProps} />;
  else if (stepId === 'protection') body = <ProtectionStep {...stepProps} />;
  else if (running || !result) body = <RunningChecks done={done} headingRef={headingRef} />;
  else if (stepId === 'result')
    body = (
      <ResultView assessment={result} input={input} headingRef={headingRef} onRetry={() => void run(input)} />
    );
  else body = <GuidanceView assessment={result} headingRef={headingRef} />;

  const inputStep = step < RESULT;

  return (
    <article className="mx-auto max-w-[75rem] px-5 py-12">
      <header className="border-b border-rule-strong pb-6">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl">{t('heading')}</h1>
          <Badge tone="neutral">{t('notLegalAdvice')}</Badge>
        </div>
        <p className="mt-3 max-w-measure text-md text-muted">{t('standfirst')}</p>
      </header>

      <div className="mt-8 grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_17rem]">
        <section className="min-w-0 rounded-data border border-rule bg-bone p-5 sm:p-8">
          <Stepper
            current={step}
            reached={running ? Math.min(reached, RESULT - 1) : reached}
            onGo={(index) => {
              if (!running) go(index);
            }}
          />

          <div className="mt-8 border-t border-rule pt-8">
            <ErrorSummary ref={summaryRef} title={t('errors.summary')} items={summaryItems} />
            <div key={`${step}-${running ? 'run' : 'idle'}`} className="step-in" data-direction={direction}>
              {body}
            </div>
          </div>

          <div className="mt-10 flex flex-wrap items-center gap-3 border-t border-rule pt-6 print:hidden">
            {step > 0 && !running ? (
              <Button variant="secondary" onClick={() => go(step - 1)}>
                <ArrowLeft size={16} aria-hidden="true" />
                {t('actions.back')}
              </Button>
            ) : null}

            <div className="ml-auto flex flex-wrap items-center gap-3">
              {inputStep ? (
                <Button onClick={next}>
                  {step === RESULT - 1 ? t('actions.run') : t('actions.continue')}
                  <ArrowRight size={16} aria-hidden="true" />
                </Button>
              ) : null}
              {step === RESULT && result && !running ? (
                <Button onClick={() => go(GUIDANCE)}>
                  {t('actions.seeGuidance')}
                  <ArrowRight size={16} aria-hidden="true" />
                </Button>
              ) : null}
              {running ? (
                <Button disabled aria-disabled="true">
                  {t('actions.running')}
                </Button>
              ) : null}
              {step >= RESULT && result && !running ? (
                <>
                  <Button variant="quiet" onClick={() => window.print()}>
                    <Printer size={16} aria-hidden="true" />
                    {t('actions.print')}
                  </Button>
                  <Button variant="secondary" onClick={restart}>
                    <RotateCcw size={16} aria-hidden="true" />
                    {t('actions.restart')}
                  </Button>
                </>
              ) : null}
            </div>
          </div>
        </section>

        <ProductSummary input={input} />
      </div>
    </article>
  );
}

/** What the reader has said so far, beside the steps, so going back is rarely needed. */
function ProductSummary({ input }: { input: AssessmentInput }) {
  const { t } = useTranslation('assessment');
  const empty = <span className="text-muted">{t('summary.empty')}</span>;
  const rows: [string, React.ReactNode][] = [
    [t('summary.category'), input.category ? t(`category.options.${input.category}.label`) : empty],
    [t('summary.name'), input.name.trim() || empty],
    [t('summary.ingredients'), input.ingredients.length ? input.ingredients.join(', ') : empty],
    [
      t('summary.novelty'),
      input.novelty.length ? input.novelty.map((n) => t(`ingredients.novelty.${n}.label`)).join('; ') : empty,
    ],
  ];

  return (
    <aside aria-labelledby="product-summary" className="rounded-data border border-rule bg-surface-sunk p-5 lg:sticky lg:top-6">
      <h2 id="product-summary" className="text-md">
        {t('summary.heading')}
      </h2>
      <dl className="m-0 mt-4 space-y-3">
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt className="text-xs text-muted">{label}</dt>
            <dd className="m-0 break-words text-base">{value}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-5 border-t border-rule pt-3 text-xs text-muted">{t('summary.privacy')}</p>
    </aside>
  );
}
