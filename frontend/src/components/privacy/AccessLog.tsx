import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ConsentDialog } from '@/components/privacy/ConsentDialog';
import { Button, Callout } from '@/components/ui';
import { recordConsent, useAccessLog, type CredentialedSource } from '@/services/privacy';

/**
 * What this session has agreed to, and what it could be asked to agree to.
 *
 * Both halves are read from the running system. The list of sources that would
 * need the reader's own credentials comes from the source manifest, so the
 * sentence "no source in the current set needs your credentials" stops being
 * shown the moment one is added — rather than staying on the page because
 * nobody remembered it was there.
 *
 * The log shows the whole history, not the current state. A reader looking at
 * this is most often looking for the grant they have since withdrawn, and a view
 * that showed only what is currently allowed would be missing exactly that row.
 *
 * The two renderers below are closures rather than exported helpers so they read
 * the same `t` this component holds. A shared `t` parameter would have to be
 * typed loosely, and the loose type is what stops a mistyped key failing `tsc`.
 */
export function AccessLog() {
  const { t } = useTranslation('privacy');
  const log = useAccessLog();
  const [asking, setAsking] = useState<CredentialedSource | null>(null);

  return (
    <>
      <p className="mt-3 max-w-measure text-base">{t('consent.body')}</p>
      {credentialedLine()}

      {log.state === 'ready' && log.log.credentialedSources.length > 0 ? (
        <ul className="m-0 mt-4 list-none space-y-3 p-0">
          {log.log.credentialedSources.map((source) => {
            const allowed = log.log.granted.includes(source.document_id);
            return (
              <li
                key={source.document_id}
                className="rounded-data border border-rule-strong p-3 sm:flex sm:items-center sm:justify-between sm:gap-4"
              >
                <div>
                  <p className="m-0 max-w-none text-base">{source.title}</p>
                  <p className="mt-0.5 max-w-none text-xs text-muted">{source.organization}</p>
                </div>
                <div className="mt-3 sm:mt-0 sm:shrink-0">
                  {allowed ? (
                    <Button variant="secondary" size="sm" onClick={() => withdraw(source)}>
                      {t('consent.withdraw')}
                    </Button>
                  ) : (
                    <Button size="sm" onClick={() => setAsking(source)}>
                      {t('consent.grant', { source: source.short_title ?? source.title })}
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}

      <h3 className="mt-10 text-md">{t('log.heading')}</h3>
      <p className="mt-2 max-w-measure text-base text-muted">{t('log.intro')}</p>
      {logBody()}

      {asking ? (
        <ConsentDialog
          source={asking}
          open={true}
          onClose={() => setAsking(null)}
          onRecorded={log.refresh}
        />
      ) : null}
    </>
  );

  function withdraw(source: CredentialedSource) {
    // Refresh either way. A failed withdrawal must not read as a successful one,
    // and re-reading the log shows it as the server actually has it.
    void recordConsent(source.document_id, false).then(log.refresh, log.refresh);
  }

  function credentialedLine() {
    if (log.state === 'loading') return null;
    if (log.state === 'unavailable') {
      return (
        <Callout tone="caution" title={t('consent.unavailable')} className="mt-4 max-w-measure" />
      );
    }
    const count = log.log.credentialedSources.length;
    return (
      <p className="mt-3 max-w-measure text-base text-muted">
        {count === 0 ? t('consent.none') : t('consent.some', { count })}
      </p>
    );
  }

  function logBody() {
    if (log.state === 'loading') {
      return <p className="mt-3 text-xs text-muted">{t('log.loading')}</p>;
    }
    if (log.state === 'unavailable') {
      return <p className="mt-3 max-w-measure text-base text-muted">{t('log.unavailable')}</p>;
    }
    if (log.log.events.length === 0) {
      return <p className="mt-3 max-w-measure text-base text-muted">{t('log.empty')}</p>;
    }

    return (
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[32rem] border-collapse text-base">
          <thead>
            <tr className="border-b border-rule-strong text-left">
              <th scope="col" className="py-2 pr-4 text-xs font-medium text-muted">
                {t('log.colSource')}
              </th>
              <th scope="col" className="py-2 pr-4 text-xs font-medium text-muted">
                {t('log.colDecision')}
              </th>
              <th scope="col" className="py-2 text-xs font-medium text-muted">
                {t('log.colWhen')}
              </th>
            </tr>
          </thead>
          <tbody>
            {log.log.events.map((event) => (
              <tr
                key={`${event.sourceId}-${event.recordedAt}`}
                className="border-b border-rule-faint align-top"
              >
                <th scope="row" className="py-3 pr-4 text-left font-medium">
                  {event.sourceName}
                </th>
                <td className="py-3 pr-4">
                  {event.granted ? t('log.granted') : t('log.withdrawn')}
                </td>
                {/* The server's timestamp, shown as the server wrote it. A time
                    re-derived in the browser would be a different fact. */}
                <td className="py-3 tabular-nums text-muted">{event.recordedAt}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
}
