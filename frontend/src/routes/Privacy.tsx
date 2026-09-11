import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { AccessLog } from '@/components/privacy/AccessLog';
import { PageIntro, PageShell } from '@/components/layout/PageIntro';
import { Button, Callout } from '@/components/ui';
import { useDocumentMeta } from '@/hooks/useDocumentMeta';
import { discardSession } from '@/services/privacy';

/**
 * The one page in this product that must not contain a sentence somebody typed
 * and forgot.
 *
 * Its structure follows the shape of the honest answer rather than the shape of
 * a policy document: why anything is kept, the two lists (kept, not kept) as a
 * table and a plain list because that is what they are, who else sees it,
 * for how long, and then the two things a reader can actually *do* — discard
 * the session, and see what they have agreed to. The doing comes last because
 * the reader has to know what they are discarding first.
 *
 * The "not kept" list is deliberately a list of absent columns rather than empty
 * fields, and it is checkable: the development audit viewer prints the table's
 * columns from the schema that creates it, and a backend test fails if a column
 * named for a question or an address ever appears.
 *
 * Not in the header navigation. Six destinations is the whole product surface,
 * and a privacy link belongs in the footer where a reader looks for it — never
 * competing with the one path through the middle.
 */
export default function Privacy() {
  const { t } = useTranslation('privacy');
  useDocumentMeta(t('meta.title'), t('meta.description'));
  const [discarded, setDiscarded] = useState(false);

  return (
    <PageShell>
      <PageIntro heading={t('heading')} standfirst={t('opening')} />

      <section className="mt-10">
        <h2 className="text-lg">{t('purpose.heading')}</h2>
        <p className="mt-3 max-w-measure text-base">{t('purpose.body')}</p>
        <ul className="m-0 mt-4 max-w-measure list-none space-y-3 p-0 text-base text-muted">
          <li className="border-l-2 border-rule-strong pl-3">{t('purpose.limitation')}</li>
          <li className="border-l-2 border-rule-strong pl-3">{t('purpose.minimisation')}</li>
          <li className="border-l-2 border-rule-strong pl-3">{t('purpose.consent')}</li>
        </ul>
      </section>

      {/* Kept and not-kept are two different shapes on purpose. What is kept has
          a reason per row, so it is a table. What is not kept has no rows at
          all, so a table would be an odd way to say "these are not columns". */}
      <section className="mt-12">
        <h2 className="text-lg">{t('stored.heading')}</h2>
        <p className="mt-3 max-w-measure text-base text-muted">{t('stored.intro')}</p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[38rem] border-collapse text-base">
            <thead>
              <tr className="border-b border-rule-strong text-left align-bottom">
                <th scope="col" className="w-[32%] py-2 pr-4 text-xs font-medium text-muted">
                  {t('stored.colField')}
                </th>
                <th scope="col" className="py-2 text-xs font-medium text-muted">
                  {t('stored.colWhy')}
                </th>
              </tr>
            </thead>
            <tbody>
              {STORED.map((key) => (
                <tr key={key} className="border-b border-rule-faint align-top">
                  <th scope="row" className="py-3 pr-4 text-left font-medium">
                    {t(`stored.${key}`)}
                  </th>
                  <td className="py-3 text-muted">{t(`stored.${key}Why`)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-12">
        <h2 className="text-lg">{t('notStored.heading')}</h2>
        <p className="mt-3 max-w-measure text-base text-muted">{t('notStored.intro')}</p>
        <ul className="m-0 mt-4 max-w-measure list-none space-y-2 p-0 text-base">
          {NOT_STORED.map((key) => (
            <li key={key} className="border-l-2 border-lac/50 pl-3">
              {t(`notStored.${key}`)}
            </li>
          ))}
        </ul>
        <p className="mt-4 max-w-measure text-xs text-muted">{t('notStored.verify')}</p>
      </section>

      <section className="mt-12">
        <h2 className="text-lg">{t('sharing.heading')}</h2>
        <p className="mt-3 max-w-measure text-base">{t('sharing.body')}</p>
        <p className="mt-3 max-w-measure text-base">{t('sharing.model')}</p>
        <p className="mt-3 max-w-measure text-base">{t('sharing.escalate')}</p>
        <p className="mt-3 max-w-measure text-base">{t('sharing.analyses')}</p>
        <p className="mt-3 max-w-measure text-base text-muted">{t('sharing.analysesDelete')}</p>
      </section>

      <section className="mt-12">
        <h2 className="text-lg">{t('retention.heading')}</h2>
        <ul className="m-0 mt-3 max-w-measure list-none space-y-2 p-0 text-base">
          <li className="border-l-2 border-rule-strong pl-3">{t('retention.session')}</li>
          <li className="border-l-2 border-rule-strong pl-3">{t('retention.rows')}</li>
          <li className="border-l-2 border-rule-strong pl-3">{t('retention.language')}</li>
        </ul>
      </section>

      <section className="mt-12">
        <h2 className="text-lg">{t('basis.heading')}</h2>
        <p className="mt-3 max-w-measure text-base">{t('basis.body')}</p>
        <p className="mt-3 max-w-measure text-base text-muted">{t('basis.notAdvice')}</p>
      </section>

      <section className="mt-12">
        <h2 className="text-lg">{t('consent.heading')}</h2>
        <AccessLog />
      </section>

      <section className="mt-12 border-t border-rule pt-8">
        <h2 className="text-lg">{t('deletion.heading')}</h2>
        <p className="mt-3 max-w-measure text-base">{t('deletion.body')}</p>
        <p className="mt-3 max-w-measure text-base text-muted">{t('deletion.keepsLanguage')}</p>
        {discarded ? (
          <Callout tone="info" title={t('deletion.done')} className="mt-4 max-w-measure" />
        ) : (
          <Button
            variant="secondary"
            className="mt-4"
            onClick={() => {
              discardSession();
              setDiscarded(true);
            }}
          >
            {t('deletion.action')}
          </Button>
        )}
      </section>
    </PageShell>
  );
}

/**
 * The rows of the two lists, named here rather than in JSX so the page cannot
 * say one thing and the locale file another.
 */
const STORED = [
  'sessionId',
  'questionHash',
  'passages',
  'versions',
  'outcome',
  'timing',
  'consentEvents',
] as const;

const NOT_STORED = ['question', 'answer', 'note', 'identity', 'ip', 'credentials'] as const;
