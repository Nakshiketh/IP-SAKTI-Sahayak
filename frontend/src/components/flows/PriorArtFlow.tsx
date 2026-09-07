import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button, Callout, Drawer } from '@/components/ui';
import { RECORDS_SOURCES } from '@/services/recordsManifest';

/**
 * Prior-art orientation. Emphatically not a novelty search.
 *
 * Three things this refuses to do, and the refusals are the feature:
 *
 *  - It never states a conclusion about novelty. Finding nothing is reported as
 *    the absence of a search, not as a result.
 *  - It never implies the traditional knowledge digital library was searched.
 *    Access there is restricted to patent offices under agreements, so the flow
 *    says so and says what to do instead.
 *  - It builds no link it has not verified. The records manifest has null link
 *    templates because nobody has read those portals' terms, so the links say
 *    they are pending rather than guessing a URL.
 *
 * The banner is fixed and has no dismiss control.
 */
export function PriorArtFlow({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation('sahayak');
  const [description, setDescription] = useState('');
  const [terms, setTerms] = useState<string[] | null>(null);
  const inputId = useId();

  const portals = RECORDS_SOURCES.filter((source) => source.access_mode === 'portal_link_only');

  function build() {
    const trimmed = description.trim();
    if (!trimmed) return;
    // What can honestly be derived from the text typed: distinct words of
    // substance. Sanskrit and vernacular synonyms, botanical binomials and
    // classification codes come from the corpus, which is not ingested.
    const stop = new Set([
      'the',
      'and',
      'for',
      'with',
      'from',
      'that',
      'this',
      'our',
      'are',
      'was',
      'has',
      'have',
      'into',
      'made',
      'used',
      'using',
      'a',
      'an',
      'of',
      'in',
      'to',
      'it',
      'is',
    ]);
    const words = trimmed
      .toLowerCase()
      .split(/[^\p{L}\p{N}-]+/u)
      .filter((word) => word.length > 2 && !stop.has(word));
    setTerms([...new Set(words)].slice(0, 12));
  }

  return (
    <Drawer open={open} onClose={onClose} title={t('flows.priorArt.title')}>
      {/*
        Fixed and non-dismissible. It is the first thing in the panel and there
        is no control anywhere that removes it.
      */}
      <div data-prior-art-banner="true">
        <Callout tone="caution" title={t('flows.priorArt.title')} titleLevel={2}>
          {t('flows.priorArt.banner', { snapshot: t('flows.priorArt.snapshotNone') })}
        </Callout>
      </div>

      <p className="mt-5 max-w-none text-base">{t('flows.priorArt.intro')}</p>

      <label htmlFor={inputId} className="mt-5 block text-xs text-muted">
        {t('flows.priorArt.inputLabel')}
      </label>
      <textarea
        id={inputId}
        rows={3}
        value={description}
        onChange={(event) => setDescription(event.target.value)}
        placeholder={t('flows.priorArt.inputPlaceholder')}
        className="mt-1.5 w-full resize-y rounded-control border border-rule-strong bg-surface px-3 py-2 text-base"
      />
      <Button className="mt-3" onClick={build}>
        {t('flows.priorArt.build')}
      </Button>

      {terms ? (
        <>
          <h3 className="mt-6 text-md">{t('flows.priorArt.termsHeading')}</h3>
          <ul className="m-0 mt-2 flex list-none flex-wrap gap-2 p-0">
            {terms.map((term) => (
              <li
                key={term}
                className="rounded-control border border-rule-strong px-2 py-0.5 text-xs"
              >
                {term}
              </li>
            ))}
          </ul>
          <p className="mt-2 max-w-none text-xs text-muted">{t('flows.priorArt.termsNote')}</p>

          <h3 className="mt-6 text-md">{t('flows.priorArt.resultsHeading')}</h3>
          <p className="mt-2 max-w-none border-l-2 border-lac pl-3 text-base">
            {t('flows.priorArt.noRecords')}
          </p>
        </>
      ) : null}

      <h3 className="mt-8 text-md">{t('flows.priorArt.elsewhereHeading')}</h3>
      <p className="mt-2 max-w-none text-xs text-muted">{t('flows.priorArt.elsewhereNote')}</p>
      <ul className="m-0 mt-3 list-none p-0">
        {portals.map((source) => (
          <li key={source.source_id} className="border-b border-rule-faint py-2 last:border-b-0">
            <p className="max-w-none text-base">{source.name}</p>
            <p className="max-w-none text-xs text-muted">
              {source.publisher} ·{' '}
              <span className="text-lac">{t('flows.priorArt.linkPending')}</span>
            </p>
          </li>
        ))}
      </ul>

      <h3 className="mt-8 text-md">{t('flows.priorArt.tkdlHeading')}</h3>
      <p className="mt-2 max-w-none text-base">{t('flows.priorArt.tkdlBody')}</p>
    </Drawer>
  );
}
