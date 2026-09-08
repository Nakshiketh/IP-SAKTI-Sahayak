import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Callout } from '@/components/ui';
import { recordsSources, type PortalLink } from '@/services/records';
import { apiMode } from '@/services/query';
import { RECORDS_SOURCES } from '@/services/recordsManifest';

/**
 * Registries this product did not search.
 *
 * The whole tab is a refusal made useful. These services are interactive and
 * session-based, and their terms generally forbid automated retrieval, so the
 * product links out instead of running the search — and says so once at the top
 * and again on every row, because a list of registries under an answer reads
 * like a list of places that were checked.
 *
 * A row with no link is still shown. Nobody has verified those portals' URL
 * structures, and a deep link written from memory would land on the wrong page
 * and look like a search that found nothing. Saying the link is not yet verified
 * is worth more to a reader than a shorter list that hides the registry.
 */
export function SearchElsewhere({ question }: { question: string }) {
  const { t } = useTranslation('sahayak');
  const [portals, setPortals] = useState<PortalLink[] | null>(null);

  useEffect(() => {
    // With no API running there is still something honest to show: the manifest
    // knows which registries exist, and that none of their links is verified.
    if (apiMode() === 'mock') {
      setPortals(
        RECORDS_SOURCES.filter((source) => source.access_mode === 'portal_link_only').map(
          (source) => ({
            sourceId: source.source_id,
            name: source.name,
            publisher: source.publisher,
            jurisdiction: source.jurisdiction,
            recordType: source.record_type,
            url: null,
            termsNote: source.terms_note,
            notSearchedHere: true,
          }),
        ),
      );
      return;
    }

    const controller = new AbortController();
    recordsSources(question, controller.signal)
      .then((result) => setPortals(result.portals))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setPortals([]);
      });
    return () => controller.abort();
  }, [question]);

  return (
    <div data-search-elsewhere="true">
      <Callout tone="caution" title={t('elsewhere.heading')} titleLevel={3} className="mt-3">
        {t('elsewhere.notSearched')}
      </Callout>

      {portals === null ? (
        <p className="mt-3 text-xs text-muted">{t('elsewhere.loading')}</p>
      ) : portals.length === 0 ? (
        <p className="mt-3 text-xs text-muted">{t('elsewhere.none')}</p>
      ) : (
        <ul className="m-0 mt-3 list-none space-y-3 p-0">
          {portals.map((portal) => (
            <li key={portal.sourceId} className="rounded-data border border-rule-strong p-3">
              <p className="m-0 max-w-none text-base">{portal.name}</p>
              <p className="mt-0.5 max-w-none text-xs text-muted">{portal.publisher}</p>
              <p className="mt-2 max-w-none text-xs text-muted">{portal.termsNote}</p>
              {portal.url ? (
                <a
                  href={portal.url}
                  rel="noreferrer nofollow"
                  target="_blank"
                  className="mt-2 inline-block rounded-data text-xs text-stamp underline underline-offset-4"
                >
                  {t('elsewhere.open')}
                </a>
              ) : (
                <p className="mt-2 max-w-none text-xs text-lac">{t('elsewhere.linkPending')}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
