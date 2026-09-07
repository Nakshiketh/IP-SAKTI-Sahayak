import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { SectionSourceList, SourceScope, Src } from '@/components/sourcing/Sourced';
import { Button, Callout, Drawer } from '@/components/ui';
import type { DocumentId } from '@/services/corpusManifest';
import {
  longestPath,
  walk,
  type Answers,
  type OutcomeId,
  type ProductClassOutcome,
  type QuestionId,
} from '@/services/classification';
import type { ProductClass } from '@/types/domain';

/**
 * "What is your product, regulatorily?"
 *
 * The graph decides the class. The corpus supplies what follows from it — which
 * is why the consequence panels below carry pending markers rather than
 * statements: a classification flow does not get to assert law from a lookup
 * table, and with nothing ingested there is nothing to assert from.
 *
 * Adaptive by construction. The walk asks only the questions its own answers
 * make necessary; a cosmetic is settled in one.
 */

/** Which instruments each consequence panel will rest on, once ingested. */
const PANEL_SOURCES: Record<'regulatory' | 'ip' | 'abs', DocumentId> = {
  regulatory: 'in-drugs-and-cosmetics-rules-1945',
  ip: 'in-patents-act-1970',
  abs: 'in-biological-diversity-act-2002',
};

/** [label key, matrix field, the instrument the panel will rest on]. */
const PANELS = [
  ['panelRegulatory', 'regulatory', PANEL_SOURCES.regulatory],
  ['panelIp', 'ip', PANEL_SOURCES.ip],
  ['panelAbs', 'abs', PANEL_SOURCES.abs],
] as const;

interface ClassificationFlowProps {
  open: boolean;
  onClose: () => void;
  onApply: (productClass: ProductClass) => void;
}

export function ClassificationFlow({ open, onClose, onApply }: ClassificationFlowProps) {
  const { t } = useTranslation('sahayak');
  const [answers, setAnswers] = useState<Answers>({});

  const result = useMemo(() => walk(answers), [answers]);
  const total = useMemo(() => longestPath(), []);

  function answer(question: QuestionId, value: 'yes' | 'no') {
    setAnswers((current) => ({ ...current, [question]: value }));
  }

  function back() {
    const asked = result.asked;
    const last = result.next ? asked[asked.length - 2] : asked[asked.length - 1];
    if (!last) return;
    setAnswers((current) => {
      const next = { ...current };
      delete next[last];
      return next;
    });
  }

  return (
    <Drawer open={open} onClose={onClose} title={t('flows.classify.title')}>
      <p className="max-w-none text-base">{t('flows.classify.intro')}</p>

      {result.next ? (
        <Question
          id={result.next}
          index={result.asked.length}
          total={total}
          onAnswer={(value) => answer(result.next!, value)}
          onBack={result.asked.length > 1 ? back : undefined}
        />
      ) : result.outcome ? (
        <Result
          outcome={result.outcome}
          asked={result.asked}
          answers={answers}
          onRestart={() => setAnswers({})}
          onApply={onApply}
        />
      ) : null}
    </Drawer>
  );
}

function Question({
  id,
  index,
  total,
  onAnswer,
  onBack,
}: {
  id: QuestionId;
  index: number;
  total: number;
  onAnswer: (value: 'yes' | 'no') => void;
  onBack?: (() => void) | undefined;
}) {
  const { t } = useTranslation('sahayak');

  return (
    <div className="mt-6">
      <p className="text-xs text-muted">{t('flows.progress', { current: index, total })}</p>
      {/* A genuine sequence, so it is numbered. */}
      <h3 className="mt-2 text-md">{t(`flows.classify.questions.${id}`)}</h3>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button onClick={() => onAnswer('yes')}>{t('flows.yes')}</Button>
        <Button variant="secondary" onClick={() => onAnswer('no')}>
          {t('flows.no')}
        </Button>
        {onBack ? (
          <Button variant="quiet" onClick={onBack}>
            {t('flows.back')}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function Result({
  outcome,
  asked,
  answers,
  onRestart,
  onApply,
}: {
  outcome: ProductClassOutcome;
  asked: QuestionId[];
  answers: Answers;
  onRestart: () => void;
  onApply: (productClass: ProductClass) => void;
}) {
  const { t } = useTranslation('sahayak');
  const { t: tc } = useTranslation('common');
  const { t: tcov } = useTranslation('covered');
  const [applied, setApplied] = useState(false);

  const single = outcome.classes.length === 1;
  const primary = outcome.classes[0]!;

  return (
    <div className="mt-6" data-outcome={outcome.id}>
      <h3 className="text-md">{t('flows.classify.resultHeading')}</h3>
      <p className="mt-2 max-w-none text-base">
        {single
          ? t('flows.classify.singleClass', { class: tc(`productClass.${primary}`) })
          : t('flows.classify.multipleClasses')}
      </p>
      {!single ? (
        <ul className="m-0 mt-2 list-none p-0 text-base">
          {outcome.classes.map((cls) => (
            <li key={cls} className="border-l-2 border-rule-strong pl-3">
              {tc(`productClass.${cls}`)}
            </li>
          ))}
        </ul>
      ) : null}

      <h4 className="mt-5 text-base text-muted">{t('flows.classify.drivenBy')}</h4>
      <ol className="m-0 mt-1.5 list-none p-0 text-xs">
        {asked.map((question, index) => (
          <li key={question} className="border-b border-rule-faint py-1 last:border-b-0">
            <span className="tabular-nums text-muted">{index + 1}. </span>
            {t(`flows.classify.questions.${question}`)}{' '}
            <span className="text-ink">
              {answers[question] === 'yes' ? t('flows.yes') : t('flows.no')}
            </span>
          </li>
        ))}
      </ol>

      <h4 className="mt-6 text-base text-muted">{t('flows.classify.consequencesHeading')}</h4>
      <p className="mt-1 max-w-none text-xs text-muted">{t('flows.classify.consequencesNote')}</p>

      <SourceScope documentIds={[PANEL_SOURCES.regulatory, PANEL_SOURCES.ip, PANEL_SOURCES.abs]}>
        <dl className="m-0 mt-3">
          {PANELS.map(([label, field, source]) => (
            <div key={field} className="border-t border-rule-faint py-3">
              <dt className="text-xs text-muted">{t(`flows.classify.${label}`)}</dt>
              <dd className="m-0 mt-1 max-w-none text-base">
                {tcov(`distinction.rows.${primary}.${field}`)}
                <Src doc={source} />
              </dd>
            </div>
          ))}
        </dl>
        <SectionSourceList />
      </SourceScope>

      <Callout
        tone="info"
        title={t('flows.classify.changesHeading')}
        titleLevel={4}
        className="mt-6"
      >
        {t(`flows.classify.changes.${outcome.id as OutcomeId}`)}
      </Callout>

      <div className="mt-6 flex flex-wrap gap-2">
        <Button
          onClick={() => {
            onApply(primary);
            setApplied(true);
          }}
        >
          {applied ? t('flows.classify.applied') : t('flows.classify.apply')}
        </Button>
        <Button variant="quiet" onClick={onRestart}>
          {t('flows.restart')}
        </Button>
      </div>
    </div>
  );
}
