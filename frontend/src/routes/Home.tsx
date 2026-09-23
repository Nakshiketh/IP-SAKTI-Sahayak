import { lazy, Suspense, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { PatentTimeline } from '@/components/home/PatentTimeline';
import { QuestionBox } from '@/components/home/QuestionBox';
import { buttonStyles, IncisedMark, TabPanel, Tabs } from '@/components/ui';
import { useDocumentMeta } from '@/hooks/useDocumentMeta';
import { LOCALES } from '@/i18n/languages';
import type { Jurisdiction } from '@/types/domain';

// The worked example reads the verified corpus, so it loads in its own chunk.
const ExampleAnswer = lazy(() => import('@/components/home/ExampleAnswer'));

/**
 * Six sections, and each one is a different shape.
 *
 *   1 hero          a headline and a working input
 *   2 steps         the route to a patent, revealed as it is read
 *   2 coupling      a comparison table, because that is what the content is
 *   3 coverage      two panels and a band, because it is a distinction
 *   4 answer        the real answer component on the verified sources
 *   5 languages     a list of specimens, one per script
 *   6 closing       a single paragraph and one link
 *
 * The variety is deliberate. Six sections of "heading, subheading, three cards"
 * reads as generated even when each one is individually fine.
 */

const INTRO_STEPS = [
  'category',
  'details',
  'ingredients',
  'protection',
  'result',
  'guidance',
] as const;
const INTRO_TYPES = ['patent', 'trademark', 'copyright', 'tradeSecret'] as const;
const INTRO_NEEDS = ['name', 'purpose', 'ingredients', 'materials'] as const;
const COUPLING_ROWS = ['classical', 'proprietary', 'newDrug'] as const;
const IP_ITEMS = [
  'patents',
  'trademarks',
  'gi',
  'copyright',
  'designs',
  'plantVariety',
  'tradeSecrets',
  'tk',
] as const;
const REG_ITEMS = [
  'classification',
  'licensing',
  'gmp',
  'quality',
  'labelling',
  'advertising',
  'foodCosmetic',
  'abs',
] as const;

export default function Home() {
  const { t } = useTranslation('home');
  useDocumentMeta(t('meta.title'), t('meta.description'));

  const tabsId = useId();
  const [jurisdiction, setJurisdiction] = useState<Jurisdiction>('IN');

  return (
    <>
      {/* 1 — Hero. One drawn element, one input, nothing competing with them. */}
      <section className="mx-auto max-w-[75rem] px-5 pb-16 pt-12">
        <div>
          <h1 className="text-2xl sm:text-3xl">
            <span className="block">{t('hero.line1')}</span>
            <span className="block">{t('hero.line2')}</span>
            <span className="block">{t('hero.line3')}</span>
          </h1>
          <p className="mt-6 max-w-measure text-md">{t('hero.standfirst')}</p>
          <QuestionBox className="mt-8" />
        </div>
      </section>

      {/* 1b — What this is, and the way into the product check. Prose on the
             left, the four kinds of protection as a definition list on the
             right: a distinction, so not four identical cards. */}
      <section aria-labelledby="intro-heading" className="border-t border-rule">
        <div className="mx-auto grid max-w-[75rem] gap-10 px-5 py-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div>
            <h2 id="intro-heading" className="text-xl">
              {t('intro.heading')}
            </h2>
            <p className="mt-4 max-w-measure">{t('intro.what')}</p>

            <h3 className="mt-8 text-md">{t('intro.whyHeading')}</h3>
            <p className="mt-2 max-w-measure text-muted">{t('intro.why')}</p>

            <h3 className="mt-8 text-md">{t('intro.helpsHeading')}</h3>
            <ol className="m-0 mt-3 list-none space-y-2 p-0">
              {INTRO_STEPS.map((step, index) => (
                <li key={step} className="flex gap-3">
                  <span
                    aria-hidden="true"
                    className="grid h-6 w-6 shrink-0 place-items-center rounded-seal border border-leaf text-xs font-medium tabular-nums text-leaf"
                  >
                    {index + 1}
                  </span>
                  <span>{t(`intro.helps.${step}`)}</span>
                </li>
              ))}
            </ol>
          </div>

          <div>
            <h3 className="text-md">{t('intro.typesHeading')}</h3>
            <dl className="m-0 mt-3">
              {INTRO_TYPES.map((type) => (
                <div key={type} className="incised incised--ip mt-4 first:mt-0">
                  <dt className="font-medium">{t(`intro.types.${type}.name`)}</dt>
                  <dd className="m-0 mt-1 text-muted">{t(`intro.types.${type}.covers`)}</dd>
                </div>
              ))}
            </dl>

            <div className="mt-8 grid gap-6 sm:grid-cols-2">
              <div>
                <h3 className="text-base font-medium">{t('intro.needHeading')}</h3>
                <ul className="m-0 mt-2 list-none space-y-1.5 p-0 text-base">
                  {INTRO_NEEDS.map((need) => (
                    <li key={need} className="border-l-2 border-rule-strong pl-3">
                      {t(`intro.need.${need}`)}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h3 className="text-base font-medium">{t('intro.getHeading')}</h3>
                <p className="mt-2 text-base">{t('intro.get')}</p>
              </div>
            </div>

            <Link to="/assess" className={buttonStyles({ className: 'mt-8' })}>
              {t('intro.cta')}
            </Link>
            <p className="mt-2 text-xs text-muted">{t('intro.ctaNote')}</p>
          </div>
        </div>
      </section>

      {/* 2 — The route to a patent. Where the drawn composition used to sit:
             it decorated the hero, and this earns the same space by telling a
             reader what actually happens and what governs each part of it. */}
      <PatentTimeline className="border-t border-rule bg-surface-sunk" />

      {/* 3 — The coupling insight, as a comparison. Not three cards. */}
      <section className="border-t border-rule bg-surface-sunk">
        <div className="mx-auto max-w-[75rem] px-5 py-14">
          <h2 className="text-xl">{t('coupling.heading')}</h2>
          <p className="mt-3 max-w-measure text-muted">{t('coupling.standfirst')}</p>

          <div className="mt-8 overflow-x-auto">
            <table className="w-full min-w-[46rem] border-collapse text-base">
              <thead>
                <tr className="border-b border-rule-strong text-left align-bottom">
                  <th scope="col" className="w-[22%] py-2 pr-4 text-xs font-medium text-muted">
                    {t('coupling.columnProduct')}
                  </th>
                  <th scope="col" className="w-[28%] py-2 pr-4 text-xs font-medium text-muted">
                    {t('coupling.columnIp')}
                  </th>
                  <th scope="col" className="w-[25%] py-2 pr-4 text-xs font-medium text-muted">
                    {t('coupling.columnRegulatory')}
                  </th>
                  <th scope="col" className="w-[25%] py-2 text-xs font-medium text-muted">
                    {t('coupling.columnAbs')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {COUPLING_ROWS.map((row) => (
                  <tr key={row} className="border-b border-rule-faint align-top">
                    <th scope="row" className="py-3 pr-4 text-left font-medium">
                      {t(`coupling.rows.${row}.product`)}
                    </th>
                    <td className="py-3 pr-4">{t(`coupling.rows.${row}.ip`)}</td>
                    <td className="py-3 pr-4">{t(`coupling.rows.${row}.regulatory`)}</td>
                    <td className="py-3">{t(`coupling.rows.${row}.abs`)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-4 text-xs text-muted">{t('coupling.note')}</p>
        </div>
      </section>

      {/* 3 — The two questions, as two panels and a band beneath them. */}
      <section className="mx-auto max-w-[75rem] px-5 py-14">
        <h2 className="text-xl">{t('covers.heading')}</h2>
        <div className="mt-8 grid gap-10 md:grid-cols-2">
          <div className="incised incised--ip">
            <h3 className="flex items-center gap-2 text-md">
              <IncisedMark kind="ip" />
              {t('covers.ipHeading')}
            </h3>
            <p className="mt-1 text-muted">{t('covers.ipQuestion')}</p>
            <ul className="mt-4 m-0 list-none p-0">
              {IP_ITEMS.map((item) => (
                <li key={item} className="border-b border-rule-faint py-2 last:border-b-0">
                  {t(`covers.ipItems.${item}`)}
                </li>
              ))}
            </ul>
          </div>

          <div className="incised incised--reg">
            <h3 className="flex items-center gap-2 text-md">
              <IncisedMark kind="regulatory" />
              {t('covers.regHeading')}
            </h3>
            <p className="mt-1 text-muted">{t('covers.regQuestion')}</p>
            <ul className="mt-4 m-0 list-none p-0">
              {REG_ITEMS.map((item) => (
                <li key={item} className="border-b border-rule-faint py-2 last:border-b-0">
                  {t(`covers.regItems.${item}`)}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <p className="mt-10 border-l-2 border-leaf pl-4 text-md">{t('covers.band')}</p>
      </section>

      {/* 4 — A real answer, from the real component, on the verified sources. */}
      <section className="border-y border-rule bg-surface-sunk">
        <div className="mx-auto max-w-[75rem] px-5 py-14">
          <h2 className="text-xl">{t('answer.heading')}</h2>
          <p className="mt-3 max-w-measure text-muted">{t('answer.standfirst')}</p>

          <div className="mt-8 rounded-data border border-rule bg-bone p-5">
            <p className="text-xs text-muted">{t('answer.questionLabel')}</p>
            <p className="mt-1 max-w-measure text-md">{t('answer.question')}</p>

            <Tabs
              aria-label={t('answer.tabsLabel')}
              idBase={tabsId}
              className="mt-6"
              items={[
                { id: 'IN', label: t('answer.tabIndia') },
                { id: 'INTL', label: t('answer.tabUk') },
              ]}
              value={jurisdiction}
              onChange={(id) => setJurisdiction(id as Jurisdiction)}
            />

            {(['IN', 'INTL'] as const).map((id) => (
              <TabPanel key={id} id={id} idBase={tabsId} active={jurisdiction === id}>
                <Suspense fallback={<div className="min-h-[24rem]" aria-busy="true" />}>
                  <ExampleAnswer jurisdiction={id} />
                </Suspense>
              </TabPanel>
            ))}
          </div>

          <Link to="/sahayak" className={buttonStyles({ variant: 'secondary', className: 'mt-6' })}>
            {t('answer.tryIt')}
          </Link>
        </div>
      </section>

      {/* 5 — Languages, as specimens. One row per script. */}
      <section className="mx-auto max-w-[75rem] px-5 py-14">
        <h2 className="text-xl">{t('languages.heading')}</h2>
        <p className="mt-3 max-w-measure text-muted">{t('languages.standfirst')}</p>

        <ul className="mt-8 m-0 grid list-none gap-x-10 gap-y-5 p-0 sm:grid-cols-2">
          {LOCALES.map((locale) => (
            <li key={locale.code} className="border-t border-rule pt-3">
              <p lang={locale.code} className="max-w-none font-display text-md">
                {locale.nativeName}
              </p>
              <p lang={locale.code} className="mt-1 text-base text-muted">
                {t(`languages.samples.${locale.code}`)}
              </p>
            </li>
          ))}
        </ul>

        <p className="mt-8 max-w-measure text-xs text-muted">{t('languages.note')}</p>
      </section>

      {/* 6 — What it will not do, then one link. */}
      <section className="border-t border-rule">
        <div className="mx-auto max-w-[75rem] px-5 py-14">
          <h2 className="text-xl">{t('closing.heading')}</h2>
          <p className="mt-3 max-w-measure">{t('closing.body')}</p>
          <Link to="/sahayak" className={buttonStyles({ className: 'mt-6' })}>
            {t('closing.cta')}
          </Link>
        </div>
      </section>
    </>
  );
}
