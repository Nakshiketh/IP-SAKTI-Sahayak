import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { SectionSourceList, SourceScope, Src } from '@/components/sourcing/Sourced';
import { Button, Callout, Drawer } from '@/components/ui';
import type { DocumentId } from '@/services/corpusManifest';

/**
 * Where a reader stands on access and benefit sharing.
 *
 * Five questions, and the first substantive one can end it: if nothing accesses
 * a biological resource, the duties are not engaged and saying so is the whole
 * answer. Every statement in the output carries a pending marker, because these
 * are statements about law and nothing has been ingested.
 *
 * It closes on the thing that matters most here — the regime was amended
 * recently, so any statement is only as good as its effective date, and this
 * corpus has none.
 */

type AbsQuestionId = 'who' | 'access' | 'purpose' | 'ip' | 'knowledge';

/** A literal union so `t('flows.abs.options.' + value)` typechecks. */
type AbsOption =
  | 'indian_individual'
  | 'indian_company'
  | 'foreign_entity'
  | 'practitioner'
  | 'researcher'
  | 'yes'
  | 'no'
  | 'research'
  | 'commercial'
  | 'codified'
  | 'community';

interface AbsQuestion {
  id: AbsQuestionId;
  options: readonly AbsOption[];
}

/** Order matters: `access` is asked early because a "no" ends the flow. */
const QUESTIONS: readonly AbsQuestion[] = [
  { id: 'access', options: ['yes', 'no'] },
  {
    id: 'who',
    options: [
      'indian_individual',
      'indian_company',
      'foreign_entity',
      'practitioner',
      'researcher',
    ],
  },
  { id: 'purpose', options: ['research', 'commercial'] },
  { id: 'ip', options: ['yes', 'no'] },
  { id: 'knowledge', options: ['codified', 'community'] },
];

const OUTPUT_SOURCES: DocumentId[] = [
  'in-biological-diversity-act-2002',
  'in-nba-abs-guidelines',
  'intl-nagoya-protocol',
  'in-patents-act-1970',
];

type Answers = Partial<Record<AbsQuestionId, AbsOption>>;

/** [output field, the instrument that field will rest on]. */
const OUTPUT_PANELS = [
  ['authority', 'in-nba-abs-guidelines'],
  ['firstStep', 'in-biological-diversity-act-2002'],
  ['sharing', 'intl-nagoya-protocol'],
  ['patent', 'in-patents-act-1970'],
] as const;

export function AbsFlow({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation('sahayak');
  const [answers, setAnswers] = useState<Answers>({});

  // "No resource accessed" settles it; nothing after that question is asked.
  const notEngaged = answers.access === 'no';
  const remaining = notEngaged ? [] : QUESTIONS.filter((question) => !answers[question.id]);
  const current = remaining[0];
  const index = QUESTIONS.length - remaining.length;

  return (
    <Drawer open={open} onClose={onClose} title={t('flows.abs.title')}>
      <p className="max-w-none text-base">{t('flows.abs.intro')}</p>

      {current ? (
        <div className="mt-6">
          <p className="text-xs text-muted">
            {t('flows.progress', { current: index + 1, total: QUESTIONS.length })}
          </p>
          <h3 className="mt-2 text-md">{t(`flows.abs.questions.${current.id}`)}</h3>
          <div className="mt-4 flex flex-wrap gap-2">
            {current.options.map((option) => (
              <Button
                key={option}
                variant={option === 'no' ? 'secondary' : 'primary'}
                size="sm"
                onClick={() => setAnswers((a) => ({ ...a, [current.id]: option }))}
              >
                {t(`flows.abs.options.${option}`)}
              </Button>
            ))}
          </div>
        </div>
      ) : (
        <Result answers={answers} notEngaged={notEngaged} onRestart={() => setAnswers({})} />
      )}
    </Drawer>
  );
}

function Result({
  answers,
  notEngaged,
  onRestart,
}: {
  answers: Answers;
  notEngaged: boolean;
  onRestart: () => void;
}) {
  const { t } = useTranslation('sahayak');

  if (notEngaged) {
    return (
      <div className="mt-6" data-abs-result="not-engaged">
        <Callout tone="info" title={t('flows.abs.resultHeading')} titleLevel={3}>
          {t('flows.abs.noTrigger')}
        </Callout>
        <Button variant="quiet" className="mt-5" onClick={onRestart}>
          {t('flows.restart')}
        </Button>
      </div>
    );
  }

  return (
    <div className="mt-6" data-abs-result="engaged">
      <h3 className="text-md">{t('flows.abs.resultHeading')}</h3>

      <SourceScope documentIds={OUTPUT_SOURCES}>
        <dl className="m-0 mt-4">
          {OUTPUT_PANELS.map(([field, source]) => (
            <div key={field} className="border-t border-rule-faint py-3">
              <dt className="text-xs text-muted">{t(`flows.abs.${field}`)}</dt>
              <dd className="m-0 mt-1 max-w-none text-base">
                {/*
                  Deliberately no asserted text. These panels are filled from
                  retrieved passages, and nothing has been retrieved — so the
                  marker names the instrument and says it is pending, rather than
                  this flow stating a duty from a lookup table.
                */}
                <Src doc={source} />
              </dd>
            </div>
          ))}
        </dl>
        <SectionSourceList />
      </SourceScope>

      <p className="mt-4 max-w-none text-xs text-muted">
        {t('flows.abs.answersRecap', {
          who: t(`flows.abs.options.${answers.who ?? 'indian_company'}`),
          purpose: t(`flows.abs.options.${answers.purpose ?? 'commercial'}`),
        })}
      </p>

      <Callout tone="caution" title={t('flows.abs.amendedHeading')} titleLevel={4} className="mt-6">
        {t('flows.abs.amended')}
      </Callout>

      <Button variant="quiet" className="mt-5" onClick={onRestart}>
        {t('flows.restart')}
      </Button>
    </div>
  );
}
