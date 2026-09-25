import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Chip } from '@/components/ui';
import { cn } from '@/lib/cn';
import type { QueryResult } from '@/services/query';

/**
 * Did this help?
 *
 * Three answers, not five. A finer scale invites a precision nobody has about
 * whether an answer helped, and the extra points would be read as data.
 *
 * "Which part?" is a fixed list rather than a text box. A box invites people to
 * type about their own formulation, and this product would then be storing a
 * description of an unpublished product it has no use for and no business
 * keeping. The closed list is the whole vocabulary.
 *
 * What is sent carries the shape of the answer — jurisdiction, confidence,
 * whether it abstained — and nothing about the reader. The server stores it
 * apart from the audit log with no session and no query id, so the verdict
 * cannot be joined back to a person.
 */

const ASPECTS = [
  'the_answer',
  'the_sources',
  'what_to_do_next',
  'why_it_could_not_conclude',
  'the_language',
] as const;

/** The three verdicts, as keys. The words a reader sees live in the locales. */
const VERDICTS = ['yes', 'partly', 'no'] as const;

type Verdict = (typeof VERDICTS)[number];

export function AnswerFeedback({ result, className }: { result: QueryResult; className?: string }) {
  const { t } = useTranslation('sahayak');
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [done, setDone] = useState(false);

  async function send(chosen: Verdict, aspect?: string) {
    try {
      await fetch('/api/v1/feedback', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          verdict: chosen,
          aspect: aspect ?? null,
          jurisdiction: result.jurisdiction,
          confidence: result.confidence.level,
          abstained: result.answer === null,
        }),
      });
    } catch {
      // A verdict that did not reach the server is not worth interrupting a
      // reader for. Nothing they were doing depended on it.
    }
  }

  if (done) {
    return (
      <p className={cn('text-xs text-muted', className)} role="status">
        {t('feedback.thanks')}
      </p>
    );
  }

  return (
    <div className={cn('print:hidden', className)}>
      <p className="text-xs text-muted">
        {verdict === null ? t('feedback.question') : t('feedback.whichPart')}
      </p>

      {verdict === null ? (
        <ul className="m-0 mt-2 flex list-none flex-wrap gap-2 p-0">
          {VERDICTS.map((option) => (
            <li key={option}>
              <Chip
                onClick={() => {
                  setVerdict(option);
                  void send(option);
                  // "Yes" needs no follow-up; asking anyway wastes the goodwill
                  // that produced it.
                  if (option === 'yes') setDone(true);
                }}
              >
                {t(`feedback.verdict.${option}`)}
              </Chip>
            </li>
          ))}
        </ul>
      ) : (
        <ul className="m-0 mt-2 flex list-none flex-wrap gap-2 p-0">
          {ASPECTS.map((aspect) => (
            <li key={aspect}>
              <Chip
                onClick={() => {
                  void send(verdict, aspect);
                  setDone(true);
                }}
              >
                {t(`feedback.aspect.${aspect}`)}
              </Chip>
            </li>
          ))}
          <li>
            <Chip onClick={() => setDone(true)}>{t('feedback.skip')}</Chip>
          </li>
        </ul>
      )}
    </div>
  );
}
