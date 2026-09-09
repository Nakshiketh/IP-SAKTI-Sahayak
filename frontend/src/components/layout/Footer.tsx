import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { useCorpusStatus } from '@/services/corpus';

/**
 * The standing disclaimer, on every page.
 *
 * Not sticky, not dismissible, not collapsed behind a link. A product that
 * answers legal and regulatory questions has to say plainly and permanently that
 * it is not doing so as an authority, and a notice a reader can close is a notice
 * a reader has not read.
 *
 * The source line's three values come from the corpus service, never from JSX.
 * When the service cannot be reached the line says so; it does not fall back to
 * a number that was true when someone typed it.
 */
export function Footer() {
  const { t } = useTranslation('common');
  const corpus = useCorpusStatus();

  return (
    <footer className="mt-16 border-t border-rule-strong">
      <div className="mx-auto max-w-[75rem] px-5 py-6">
        <p className="max-w-measure text-xs text-muted">{t('footer.disclaimer')}</p>
        <p className="mt-3 max-w-none text-xs text-muted">{sourceLine()}</p>
        {/* Here rather than in the header. A reader looks for it at the bottom
            of a page, and a seventh navigation item would put it in front of
            the one path through the middle. */}
        <p className="mt-3 max-w-none text-xs">
          <Link to="/privacy" className="rounded-data text-muted underline underline-offset-4">
            {t('footer.privacy')}
          </Link>
        </p>
      </div>
    </footer>
  );

  function sourceLine() {
    if (corpus.state === 'loading') return '';
    if (corpus.state === 'unavailable') return t('footer.sourceMetaUnavailable');

    const { documentCount, asOfDate, corpusVersion } = corpus.status;
    // No corpus is ingested until Phase 11. Saying "0 documents" as though that
    // were a source count would be worse than saying there are none.
    if (documentCount === 0 || asOfDate === null) {
      return t('footer.sourceMetaEmpty', { version: corpusVersion });
    }
    return t('footer.sourceMeta', {
      date: asOfDate,
      count: documentCount,
      version: corpusVersion,
    });
  }
}
