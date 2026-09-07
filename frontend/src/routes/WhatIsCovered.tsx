import { useTranslation } from 'react-i18next';

import { SectionSourceList, SourceScope, Src } from '@/components/covered/Sourced';
import { Callout, IncisedMark } from '@/components/ui';
import { useDocumentMeta } from '@/hooks/useDocumentMeta';
import { CORPUS_VERSION } from '@/services/corpusManifest';
import type { DocumentId } from '@/services/corpusManifest';
import type { ProductClass } from '@/types/domain';

/**
 * Reference material, and it should look like reference material.
 *
 * Dense, indexed, text-forward. The density is the credibility signal: a
 * practitioner deciding whether this product understands their problem is
 * reassured by a page that reads like a professional reference and put off by
 * eight marketing cards.
 *
 * Every factual statement carries a marker naming the document it rests on. No
 * document has been ingested, so every marker is in its pending state and the
 * page says so once, at the top, rather than a hundred times.
 */

const MATRIX_ROWS = [
  {
    key: 'classical_generic',
    ip: 'in-patents-act-1970',
    reg: 'in-drugs-and-cosmetics-rules-1945',
    abs: 'in-biological-diversity-act-2002',
  },
  {
    key: 'patent_proprietary',
    ip: 'in-patents-act-1970',
    reg: 'in-drugs-and-cosmetics-rules-1945',
    abs: 'in-biological-diversity-act-2002',
  },
  {
    key: 'new_non_classical_drug',
    ip: 'in-patents-act-1970',
    reg: 'in-drugs-and-cosmetics-rules-1945',
    abs: 'in-biological-diversity-act-2002',
  },
  {
    key: 'phytopharmaceutical',
    ip: 'in-patents-act-1970',
    reg: 'in-drugs-and-cosmetics-rules-1945',
    abs: 'in-biological-diversity-act-2002',
  },
  {
    key: 'ayurveda_aahar',
    ip: 'in-trade-marks-act-1999',
    reg: 'in-fssai-ayurveda-aahara-2022',
    abs: 'in-biological-diversity-act-2002',
  },
  {
    key: 'cosmetic',
    ip: 'in-designs-act-2000',
    reg: 'in-drugs-and-cosmetics-act-1940',
    abs: 'in-biological-diversity-act-2002',
  },
] as const;

/**
 * A section's source list is *derived* from the markers inside it, never
 * declared separately. Declaring it separately is how a section ends up listing
 * a document that nothing on the page actually points at — a sourcing plan that
 * looks fuller than it is.
 */
function uniqueSources(...ids: readonly DocumentId[]): DocumentId[] {
  return [...new Set(ids)];
}

const MATRIX_SOURCES: DocumentId[] = uniqueSources(
  ...MATRIX_ROWS.flatMap((row) => [row.ip, row.reg, row.abs]),
);

const RIGHT_FIELDS = ['protects', 'inAyurveda', 'question', 'doesNot', 'jurisdiction'] as const;
type RightField = (typeof RIGHT_FIELDS)[number];

/**
 * One source per field, because the fields rest on different things: what a
 * patent protects comes from the Act; how it shows up in Ayurveda comes from the
 * guidance on examining traditional-knowledge applications.
 *
 * `gaps` names fields that state an absence rather than a rule. India has no
 * standalone trade-secrets statute, and citing the Patents Act for that sentence
 * would be citing the wrong instrument to avoid an empty space.
 */
const RIGHTS = [
  {
    key: 'patents',
    anchor: 'patents',
    fieldSources: {
      protects: 'in-patents-act-1970',
      inAyurveda: 'in-tk-biological-material-guidelines',
      question: 'in-tk-biological-material-guidelines',
      doesNot: 'in-patents-act-1970',
      jurisdiction: 'in-patent-office-manual',
    },
    gaps: [],
  },
  {
    key: 'gi',
    anchor: 'geographical-indications',
    fieldSources: {
      protects: 'in-gi-act-1999',
      inAyurveda: 'in-gi-act-1999',
      question: 'in-gi-rules-2002',
      doesNot: 'in-gi-act-1999',
      jurisdiction: 'in-gi-act-1999',
    },
    gaps: [],
  },
  {
    key: 'trademarks',
    anchor: 'trademarks',
    fieldSources: {
      protects: 'in-trade-marks-act-1999',
      inAyurveda: 'in-trade-marks-act-1999',
      question: 'in-trade-marks-act-1999',
      doesNot: 'in-magic-remedies-act-1954',
      jurisdiction: 'in-trade-marks-act-1999',
    },
    gaps: [],
  },
  {
    key: 'copyright',
    anchor: 'copyright',
    fieldSources: {
      protects: 'in-copyright-act-1957',
      inAyurveda: 'in-copyright-act-1957',
      question: 'in-copyright-act-1957',
      doesNot: 'in-copyright-act-1957',
      jurisdiction: 'in-copyright-act-1957',
    },
    gaps: [],
  },
  {
    key: 'designs',
    anchor: 'designs',
    fieldSources: {
      protects: 'in-designs-act-2000',
      inAyurveda: 'in-designs-act-2000',
      question: 'in-designs-act-2000',
      doesNot: 'in-designs-act-2000',
      jurisdiction: 'in-designs-act-2000',
    },
    gaps: [],
  },
  {
    key: 'plantVariety',
    anchor: 'plant-variety',
    fieldSources: {
      protects: 'in-ppvfr-act-2001',
      inAyurveda: 'in-ppvfr-act-2001',
      question: 'in-ppvfr-act-2001',
      doesNot: 'in-ppvfr-act-2001',
      jurisdiction: 'in-ppvfr-act-2001',
    },
    gaps: [],
  },
  {
    key: 'tradeSecrets',
    anchor: 'trade-secrets',
    fieldSources: {
      protects: 'in-patents-act-1970',
      inAyurveda: 'in-patents-act-1970',
      question: 'in-patents-act-1970',
      doesNot: 'in-patents-act-1970',
      jurisdiction: 'in-patents-act-1970',
    },
    gaps: ['protects', 'jurisdiction'],
  },
  {
    key: 'tk',
    anchor: 'traditional-knowledge',
    fieldSources: {
      protects: 'in-tkdl-access-model',
      inAyurveda: 'in-tk-biological-material-guidelines',
      question: 'intl-wipo-gratk-2024',
      doesNot: 'in-tkdl-access-model',
      jurisdiction: 'intl-wipo-gratk-2024',
    },
    gaps: [],
  },
] as const satisfies ReadonlyArray<{
  key: string;
  anchor: string;
  fieldSources: Record<RightField, DocumentId>;
  gaps: readonly RightField[];
}>;

type Right = (typeof RIGHTS)[number];

function isGap(right: Right, field: RightField): boolean {
  return (right.gaps as readonly string[]).includes(field);
}

function rightSources(right: Right): DocumentId[] {
  return uniqueSources(
    ...RIGHT_FIELDS.filter((field) => !isGap(right, field)).map(
      (field) => right.fieldSources[field],
    ),
  );
}

const REGULATION_ITEMS = [
  {
    key: 'classification',
    anchor: 'classification',
    sources: ['in-drugs-and-cosmetics-rules-1945'],
  },
  {
    key: 'licence',
    anchor: 'licence',
    sources: ['in-drugs-and-cosmetics-act-1940', 'in-drugs-and-cosmetics-rules-1945'],
  },
  { key: 'gmp', anchor: 'gmp', sources: ['in-drugs-and-cosmetics-rules-1945'] },
  {
    key: 'quality',
    anchor: 'quality',
    sources: ['in-ayurvedic-pharmacopoeia', 'in-ayurvedic-formulary'],
  },
  {
    key: 'labelling',
    anchor: 'labelling',
    sources: [
      'in-drugs-and-cosmetics-rules-1945',
      'in-legal-metrology-packaged-2011',
      'in-fssai-labelling-claims',
    ],
  },
  {
    key: 'advertising',
    anchor: 'advertising',
    sources: ['in-magic-remedies-act-1954', 'in-fssai-labelling-claims'],
  },
  {
    key: 'food',
    anchor: 'food-route',
    sources: ['in-fssai-ayurveda-aahara-2022', 'in-fssai-labelling-claims'],
  },
  {
    key: 'cosmetic',
    anchor: 'cosmetic-route',
    sources: ['in-drugs-and-cosmetics-act-1940', 'in-drugs-and-cosmetics-rules-1945'],
  },
  {
    key: 'clinicalEvidence',
    anchor: 'clinical-evidence',
    sources: ['in-drugs-and-cosmetics-rules-1945'],
  },
  {
    key: 'marketAccess',
    anchor: 'market-access',
    sources: [
      'uk-traditional-herbal-registration',
      'eu-traditional-herbal-directive',
      'us-dietary-supplement-framework',
    ],
  },
] as const;

/** Body cites all of the section's instruments; the watch-for line cites the last. */
const REGULATION = REGULATION_ITEMS.map((item) => ({
  ...item,
  sources: uniqueSources(...item.sources),
  watchForSource: item.sources[item.sources.length - 1]!,
}));

const ABS_SOURCES: DocumentId[] = [
  'in-biological-diversity-act-2002',
  'in-biological-diversity-rules-2024',
  'in-nba-abs-guidelines',
  'intl-nagoya-protocol',
  'in-patents-act-1970',
];

/** [heading key, body key, the document the body will rest on]. */
const ABS_ROWS = [
  ['whoHeading', 'whoBody', 'in-biological-diversity-act-2002'],
  ['triggerHeading', 'triggerBody', 'in-biological-diversity-act-2002'],
  ['authorityHeading', 'authorityBody', 'in-nba-abs-guidelines'],
  ['sharingHeading', 'sharingBody', 'intl-nagoya-protocol'],
  ['patentHeading', 'patentBody', 'in-patents-act-1970'],
  ['changeHeading', 'changeBody', 'in-biological-diversity-rules-2024'],
] as const;

export default function WhatIsCovered() {
  const { t } = useTranslation('covered');
  useDocumentMeta(t('meta.title'), t('meta.description'));

  return (
    <article className="mx-auto max-w-[75rem] px-5 py-12">
      <header className="border-b border-rule-strong pb-6">
        <h1 className="text-2xl">{t('heading')}</h1>
        <p className="mt-3 max-w-measure text-md text-muted">{t('standfirst')}</p>
      </header>

      <Callout
        tone="caution"
        title={t('pending.title')}
        // A page-level notice sitting directly under the h1, so h2 — the default
        // h3 would skip a level and break the outline.
        titleLevel={2}
        className="mt-6 max-w-measure print:hidden"
      >
        {t('pending.body')}
      </Callout>

      <div className="mt-10 gap-12 lg:grid lg:grid-cols-[15rem_1fr]">
        <Contents />

        <div className="min-w-0">
          {/* A — the distinction, and the matrix that follows from it. */}
          <section id="two-questions" className="scroll-mt-8">
            <h2 className="text-xl">{t('distinction.heading')}</h2>

            <div className="mt-6 grid gap-8 sm:grid-cols-2">
              <div className="incised incised--ip">
                <h3 className="flex items-center gap-2 text-md">
                  <IncisedMark kind="ip" />
                  {t('distinction.ipHeading')}
                </h3>
                <p className="mt-2">{t('distinction.ipBody')}</p>
              </div>
              <div className="incised incised--reg">
                <h3 className="flex items-center gap-2 text-md">
                  <IncisedMark kind="regulatory" />
                  {t('distinction.regHeading')}
                </h3>
                <p className="mt-2">{t('distinction.regBody')}</p>
              </div>
            </div>

            <h3 className="mt-10 text-md">{t('distinction.couplingHeading')}</h3>
            <p className="mt-2 max-w-measure">{t('distinction.couplingBody')}</p>

            <SourceScope documentIds={MATRIX_SOURCES}>
              <h3 className="mt-10 text-md">{t('distinction.matrixHeading')}</h3>
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[52rem] border-collapse text-base">
                  <thead>
                    <tr className="border-b border-rule-strong text-left align-bottom">
                      <th scope="col" className="w-[16%] py-2 pr-4 text-xs font-medium text-muted">
                        {t('distinction.colProduct')}
                      </th>
                      <th scope="col" className="w-[28%] py-2 pr-4 text-xs font-medium text-muted">
                        {t('distinction.colIp')}
                      </th>
                      <th scope="col" className="w-[28%] py-2 pr-4 text-xs font-medium text-muted">
                        {t('distinction.colRegulatory')}
                      </th>
                      <th scope="col" className="w-[28%] py-2 text-xs font-medium text-muted">
                        {t('distinction.colAbs')}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {MATRIX_ROWS.map((row) => (
                      <tr key={row.key} className="border-b border-rule-faint align-top">
                        <th scope="row" className="py-3 pr-4 text-left font-medium">
                          <ProductClassName classKey={row.key} />
                        </th>
                        <td className="py-3 pr-4">
                          {t(`distinction.rows.${row.key}.ip`)}
                          <Src doc={row.ip} />
                        </td>
                        <td className="py-3 pr-4">
                          {t(`distinction.rows.${row.key}.regulatory`)}
                          <Src doc={row.reg} />
                        </td>
                        <td className="py-3">
                          {t(`distinction.rows.${row.key}.abs`)}
                          <Src doc={row.abs} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-3 text-xs text-muted">{t('distinction.matrixNote')}</p>
              <SectionSourceList />
            </SourceScope>
          </section>

          {/* B — the rights, as ledger entries. */}
          <section id="rights" className="mt-16 scroll-mt-8">
            <h2 className="text-xl">{t('rights.heading')}</h2>
            <p className="mt-3 max-w-measure text-muted">{t('rights.standfirst')}</p>

            {RIGHTS.map((right) => (
              <SourceScope key={right.key} documentIds={rightSources(right)}>
                <section id={right.anchor} className="mt-10 scroll-mt-8 border-t border-rule pt-5">
                  <h3 className="text-md">{t(`rights.items.${right.key}.title`)}</h3>
                  <dl className="mt-3 m-0">
                    {RIGHT_FIELDS.map((field) => (
                      <div
                        key={field}
                        className="grid grid-cols-1 gap-x-6 gap-y-0.5 border-b border-rule-faint py-2.5 last:border-b-0 sm:grid-cols-[11rem_1fr]"
                      >
                        <dt className="text-xs text-muted">{t(`rights.labels.${field}`)}</dt>
                        <dd className="m-0 max-w-measure">
                          {t(`rights.items.${right.key}.${field}`)}
                          {isGap(right, field) ? (
                            <GapNote />
                          ) : (
                            <Src doc={right.fieldSources[field]} />
                          )}
                        </dd>
                      </div>
                    ))}
                  </dl>
                  <SectionSourceList />
                </section>
              </SourceScope>
            ))}
          </section>

          {/* C — regulation, as prose with a warning line. A different shape. */}
          <section id="regulation" className="mt-16 scroll-mt-8">
            <h2 className="text-xl">{t('regulation.heading')}</h2>
            <p className="mt-3 max-w-measure text-muted">{t('regulation.standfirst')}</p>

            {REGULATION.map((item) => (
              <SourceScope key={item.key} documentIds={item.sources}>
                <section id={item.anchor} className="mt-10 scroll-mt-8 border-t border-rule pt-5">
                  <h3 className="text-md">{t(`regulation.items.${item.key}.title`)}</h3>
                  <p className="mt-2 max-w-measure">
                    {t(`regulation.items.${item.key}.body`)}
                    {item.sources.map((source) => (
                      <Src key={source} doc={source} />
                    ))}
                  </p>
                  <p className="mt-3 max-w-measure border-l-2 border-lac/50 pl-3 text-base">
                    <span className="text-xs text-muted">{t('regulation.watchFor')}</span>
                    <br />
                    {t(`regulation.items.${item.key}.watchFor`)}
                    <Src doc={item.watchForSource} />
                  </p>
                  <SectionSourceList />
                </section>
              </SourceScope>
            ))}
          </section>

          {/* D — access and benefit sharing, with the weight it deserves. */}
          <SourceScope documentIds={ABS_SOURCES}>
            <section id="abs" className="mt-16 scroll-mt-8 border-t border-rule-strong pt-6">
              <h2 className="text-xl">{t('abs.heading')}</h2>
              <p className="mt-3 max-w-measure text-muted">{t('abs.standfirst')}</p>

              <dl className="mt-8 m-0">
                {ABS_ROWS.map(([heading, body, source]) => (
                  <div key={heading} className="border-t border-rule-faint py-4 first:border-t-0">
                    <dt className="text-md">{t(`abs.${heading}`)}</dt>
                    <dd className="m-0 mt-1.5 max-w-measure">
                      {t(`abs.${body}`)}
                      <Src doc={source} />
                    </dd>
                  </div>
                ))}
              </dl>

              <p className="mt-6 max-w-measure border-l-2 border-lac pl-4 text-base">
                {t('abs.asOfNote', { version: CORPUS_VERSION })}
              </p>

              <SectionSourceList />
            </section>
          </SourceScope>
        </div>
      </div>
    </article>
  );
}

/**
 * Marks a statement that has no instrument to cite because it describes an
 * absence. Saying so is more honest than pointing at an adjacent statute.
 */
function GapNote() {
  const { t } = useTranslation('covered');
  return <span className="ml-1 text-xs text-lac">{t('sourceList.gap')}</span>;
}

function ProductClassName({ classKey }: { classKey: ProductClass }) {
  const { t } = useTranslation('common');
  return <>{t(`productClass.${classKey}`)}</>;
}

/**
 * In-page contents. Sticky on desktop so a reader deep in the regulation list
 * can still see where they are; a plain list on a phone, where a sticky column
 * would eat the screen.
 */
function Contents() {
  const { t } = useTranslation('covered');

  return (
    <nav
      aria-label={t('contents')}
      className="mb-10 lg:sticky lg:top-8 lg:mb-0 lg:max-h-[calc(100vh-4rem)] lg:self-start lg:overflow-y-auto print:hidden"
    >
      <p className="text-xs text-muted">{t('contents')}</p>
      <ul className="m-0 mt-2 list-none space-y-1 p-0 text-base">
        <li>
          <a href="#two-questions" className="rounded-data hover:text-leaf">
            {t('distinction.navLabel')}
          </a>
        </li>
        <li>
          <a href="#rights" className="rounded-data hover:text-leaf">
            {t('rights.navLabel')}
          </a>
          <ul className="m-0 mt-1 list-none space-y-1 border-l border-rule pl-3 p-0 text-xs">
            {RIGHTS.map((right) => (
              <li key={right.key}>
                <a href={`#${right.anchor}`} className="rounded-data text-muted hover:text-leaf">
                  {t(`rights.items.${right.key}.title`)}
                </a>
              </li>
            ))}
          </ul>
        </li>
        <li>
          <a href="#regulation" className="rounded-data hover:text-leaf">
            {t('regulation.navLabel')}
          </a>
          <ul className="m-0 mt-1 list-none space-y-1 border-l border-rule pl-3 p-0 text-xs">
            {REGULATION.map((item) => (
              <li key={item.key}>
                <a href={`#${item.anchor}`} className="rounded-data text-muted hover:text-leaf">
                  {t(`regulation.items.${item.key}.title`)}
                </a>
              </li>
            ))}
          </ul>
        </li>
        <li>
          <a href="#abs" className="rounded-data hover:text-leaf">
            {t('abs.navLabel')}
          </a>
        </li>
      </ul>
    </nav>
  );
}
