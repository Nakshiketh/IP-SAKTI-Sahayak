import { CircleCheck, CircleHelp, ExternalLink, Plus, TriangleAlert, X } from 'lucide-react';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { AtAGlance, SharedDots, VerdictScale } from '@/components/analyst/Visuals';
import { Badge, Button, Disclosure, TabPanel, Tabs } from '@/components/ui';
import { cn } from '@/lib/cn';
import type {
  Analysis,
  Conversation,
  Indicator,
  IngredientEdit,
  InventionEdit,
  ProductMatch,
  Reason,
} from '@/services/analyst';

/**
 * The findings beside the conversation.
 *
 * Every finding is rendered as one of two things, and they look different on
 * purpose: "Found" — something retrieved, with its source — on the indigo sourced
 * rule, and "Our reading" — this product's interpretation — on the dashed rule the
 * design system uses for anything that is not a source.
 */

const REQUIREMENTS = ['novelty', 'inventive_step', 'industrial_applicability'] as const;
const COMPOSITION_COLUMNS = ['name', 'quantity', 'percent', 'purpose'] as const;

type Translate = (key: string, options?: Record<string, unknown>) => string;

function useTx(): Translate {
  const { t } = useTranslation('analyst');
  return t as unknown as Translate;
}

function formatParams(params: Record<string, unknown>, t: Translate): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) {
      out[key] = (key === 'uses' ? value.map((use) => t(`use.${String(use)}`)) : value).join(', ');
    } else {
      out[key] = value;
    }
  }
  return out;
}

function useReasonText() {
  const t = useTx();
  return (reason: Reason) => {
    let code = reason.code;
    if (code === 'filing_before_disclosure' && reason.params.public) code = 'filing_already_public';
    if (code === 'detailed_search' && reason.params.state !== 'searched')
      code = 'detailed_search_not_loaded';
    return t(`reason.${code}`, { ...formatParams(reason.params, t), defaultValue: code });
  };
}

function ReasonList({ reasons }: { reasons: readonly Reason[] }) {
  const t = useTx();
  const text = useReasonText();
  return (
    <ul className="m-0 list-none space-y-2 p-0">
      {reasons.map((reason, index) => (
        <li
          key={`${reason.code}-${index}`}
          className={reason.basis === 'evidence' ? 'rule-sourced' : 'rule-illustrative'}
        >
          <span
            className={cn(
              'block text-xs',
              reason.basis === 'evidence' ? 'text-stamp' : 'text-muted',
            )}
          >
            {reason.basis === 'evidence' ? t('findings.found') : t('findings.reading')}
          </span>
          <span className="block text-base">{text(reason)}</span>
        </li>
      ))}
    </ul>
  );
}

const INDICATOR_STYLE: Record<Indicator, { box: string; mark: string; Icon: typeof CircleCheck }> =
  {
    potentially_novel: { box: 'border-leaf bg-leaf/[0.06]', mark: 'text-leaf', Icon: CircleCheck },
    further_assessment: {
      box: 'border-ink/60 bg-surface-sunk',
      mark: 'text-ink',
      Icon: CircleHelp,
    },
    high_similarity: { box: 'border-lac bg-lac/[0.06]', mark: 'text-lac', Icon: TriangleAlert },
  };

export function IndicatorPanel({ indicator }: { indicator: Indicator }) {
  const t = useTx();
  const { box, mark, Icon } = INDICATOR_STYLE[indicator];
  return (
    <div className={cn('rounded-control border-l-4 p-4', box)} data-indicator={indicator}>
      <p className={cn('flex items-center gap-2 font-display text-lg', mark)}>
        <Icon size={20} aria-hidden="true" className="shrink-0" />
        {t(`indicator.${indicator}.label`)}
      </p>
      <p className="mt-2 text-base">{t(`indicator.${indicator}.body`)}</p>
    </div>
  );
}

function AssessmentTab({ analysis }: { analysis: Analysis }) {
  const t = useTx();
  const text = useReasonText();
  const a = analysis.assessment;
  return (
    <div className="space-y-8">
      <div>
        <IndicatorPanel indicator={a.indicator} />
        <VerdictScale indicator={a.indicator} />
        <AtAGlance analysis={analysis} total={analysis.knowledge.ingredients.length} />
        <h3 className="mt-5 text-md">{t('indicator.whyHeading')}</h3>
        <div className="mt-3">
          <ReasonList reasons={a.reasons} />
        </div>
        <p className="mt-4 text-xs text-muted">{t('indicator.caveat')}</p>
      </div>

      <section aria-labelledby="req-heading">
        <h3 id="req-heading" className="text-md">
          {t('requirements.heading')}
        </h3>
        <dl className="m-0 mt-3 divide-y divide-rule-faint rounded-data border border-rule bg-surface">
          {REQUIREMENTS.map((key) => (
            <div key={key} className="p-4">
              <dt className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-medium">{t(`requirements.${key}`)}</span>
                <Badge>{t(`requirements.status.${a[key].status}`)}</Badge>
              </dt>
              <dd className="m-0 mt-3">
                <ReasonList reasons={a[key].reasons} />
              </dd>
            </div>
          ))}
        </dl>
        <h4 className="mt-5 text-base">{t('requirements.exclusionsHeading')}</h4>
        {a.exclusions.length ? (
          <ul className="m-0 mt-2 list-none space-y-2 p-0">
            {a.exclusions.map((reason) => (
              <li key={reason.code} className="border-l-2 border-lac pl-3">
                {text(reason)}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-muted">{t('requirements.exclusionsNone')}</p>
        )}
      </section>

      <section aria-labelledby="ip-heading">
        <h3 id="ip-heading" className="text-md">
          {t('ip.heading')}
        </h3>
        <ul className="m-0 mt-3 list-none p-0">
          {analysis.ip_options.map((option) => (
            <li key={option.type} className="border-b border-rule-faint py-3 last:border-b-0">
              <p className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-medium">{t(`ip.types.${option.type}`)}</span>
                <Badge tone={option.relevance === 'relevant' ? 'sourced' : 'neutral'}>
                  {t(`ip.relevance.${option.relevance}`)}
                </Badge>
              </p>
              {option.reasons.map((reason) => (
                <p key={reason.code} className="mt-1 text-base text-muted">
                  {text(reason)}
                </p>
              ))}
            </li>
          ))}
        </ul>
      </section>

      <section
        aria-labelledby="next-heading"
        className="rounded-data border border-rule bg-surface-sunk p-4"
      >
        <h3 id="next-heading" className="text-md">
          {t('next.heading')}
        </h3>
        <ol className="m-0 mt-3 list-none space-y-3 p-0">
          {analysis.next_steps.map((step, index) => (
            <li key={step.code} className="flex gap-3">
              <span
                aria-hidden="true"
                className="grid h-6 w-6 shrink-0 place-items-center rounded-seal border border-leaf text-xs font-medium tabular-nums text-leaf"
              >
                {index + 1}
              </span>
              <span>{text(step)}</span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

function pct(value: number | null): string {
  return value === null ? '' : `${Number.isInteger(value) ? value : value.toFixed(2)}%`;
}

function ProductCard({ match }: { match: ProductMatch }) {
  const t = useTx();
  return (
    <article
      className="rounded-data border border-rule bg-surface p-4"
      data-product={match.product_id}
    >
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h4 className="text-base">{match.name}</h4>
          <p className="text-xs text-muted">
            {[match.brand, match.manufacturer].filter(Boolean).join(', ')}
          </p>
        </div>
        <Badge tone={match.level === 'high' ? 'caution' : 'neutral'}>
          {t(`products.level.${match.level}`)}
        </Badge>
      </header>
      <p className="mt-2 text-base">
        <SharedDots shared={match.shared_count} total={match.user_count} />{' '}
        {t('products.shared', { shared: match.shared_count, total: match.user_count })}
        {match.same_form ? `, ${t('products.sameForm')}` : ''}
        {match.shared_uses.length
          ? `, ${t('products.sharedUse', { uses: match.shared_uses.map((u) => t(`use.${u}`)).join(', ') })}`
          : ''}
      </p>

      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[30rem] border-collapse text-base">
          <caption className="sr-only">
            {t('products.comparisonCaption', { name: match.name })}
          </caption>
          <thead>
            <tr className="border-b border-rule-strong text-left">
              <th scope="col" className="py-1.5 pr-3 text-xs font-medium text-muted">
                {t('products.columns.ingredient')}
              </th>
              <th scope="col" className="py-1.5 pr-3 text-xs font-medium text-muted">
                {t('products.columns.yours')}
              </th>
              <th scope="col" className="py-1.5 pr-3 text-xs font-medium text-muted">
                {t('products.columns.theirs')}
              </th>
              <th scope="col" className="py-1.5 text-xs font-medium text-muted">
                {t('products.columns.difference')}
              </th>
            </tr>
          </thead>
          <tbody>
            {match.rows.map((row) => (
              <tr
                key={`${row.status}-${row.key}`}
                className="border-b border-rule-faint align-top"
                data-status={row.status}
              >
                <th scope="row" className="py-1.5 pr-3 text-left font-normal">
                  {row.label}
                  <span
                    className={cn(
                      'block text-xs',
                      row.status === 'common'
                        ? 'text-muted'
                        : row.status === 'added'
                          ? 'text-leaf'
                          : 'text-lac',
                    )}
                  >
                    {t(`products.status.${row.status}`)}
                  </span>
                </th>
                <td className="py-1.5 pr-3">
                  {row.user_name
                    ? pct(row.user_percent) || row.user_amount || ''
                    : t('products.notListed')}
                </td>
                <td className="py-1.5 pr-3">
                  {row.product_name
                    ? [
                        row.product_name,
                        row.product_percent !== null ? pct(row.product_percent) : null,
                      ]
                        .filter(Boolean)
                        .join(' — ')
                    : t('products.notListed')}
                </td>
                <td className="py-1.5">
                  {row.difference ? t(`products.difference.${row.difference}`) : ''}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {match.base_ingredients.length ? (
        <p className="mt-2 text-xs text-muted">
          {t('products.base', {
            count: match.base_ingredients.length,
            names: match.base_ingredients.join(', '),
          })}
        </p>
      ) : null}

      <div className="mt-4">
        <ReasonList reasons={match.notes} />
      </div>

      {match.stated_use.length ? (
        <div className="mt-4">
          <p className="text-xs text-muted">{t('products.statedUse')}</p>
          {match.stated_use.map((quote) => (
            <blockquote
              key={quote}
              className="m-0 mt-1 border-l-2 border-rule-strong pl-3 text-base"
            >
              {quote}
            </blockquote>
          ))}
        </div>
      ) : null}

      <div className="mt-4 border-t border-rule-faint pt-3">
        <p className="text-xs text-muted">
          {t('products.sources')} — {t(`products.scope.${match.ingredient_list_scope}`)}
        </p>
        <ul className="m-0 mt-1 list-none space-y-2 p-0">
          {match.sources.map((source) => (
            <li key={source.url} className="rule-sourced text-xs">
              <a
                href={source.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-stamp underline underline-offset-2"
              >
                {source.publisher}
                <ExternalLink size={12} aria-hidden="true" />
              </a>{' '}
              <span className="text-muted">
                {t('products.retrieved', { date: source.retrieved_at })}
              </span>
              <Disclosure
                summary={<span className="text-xs">{t('products.excerpt')}</span>}
                className="mt-1"
              >
                <blockquote className="m-0 mt-1 text-xs text-muted">{source.excerpt}</blockquote>
              </Disclosure>
            </li>
          ))}
        </ul>
      </div>
    </article>
  );
}

function ProductsTab({ analysis }: { analysis: Analysis }) {
  const t = useTx();
  const products = analysis.products;
  return (
    <div className="space-y-4">
      <p className="text-muted">
        {t('products.intro', { size: products.dataset_size, date: products.retrieved_at })}
      </p>
      {products.matches.length === 0 ? (
        <p className="rule-illustrative">{t('products.none', { size: products.dataset_size })}</p>
      ) : (
        products.matches.map((match) => <ProductCard key={match.product_id} match={match} />)
      )}
      {products.weaker.length ? (
        <Disclosure summary={t('products.weaker', { count: products.weaker.length })}>
          <div className="mt-3 space-y-4">
            {products.weaker.map((match) => (
              <ProductCard key={match.product_id} match={match} />
            ))}
          </div>
        </Disclosure>
      ) : null}
    </div>
  );
}

function KnowledgeTab({ analysis }: { analysis: Analysis }) {
  const t = useTx();
  const k = analysis.knowledge;
  return (
    <div className="space-y-5">
      <p className="text-muted">
        {t('knowledge.intro', { size: k.reference_size, formulations: k.formulation_count })}
      </p>
      <ul className="m-0 list-none divide-y divide-rule-faint rounded-data border border-rule bg-surface p-0">
        {k.ingredients.map((row) => (
          <li
            key={row.key}
            className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-2.5"
          >
            <span>
              {row.name}
              {row.label && row.label.toLowerCase() !== row.name.toLowerCase() ? (
                <span className="text-muted"> — {row.label}</span>
              ) : null}
            </span>
            <Badge tone={row.recognised === 'traditional' ? 'sourced' : 'neutral'}>
              {t(`knowledge.recognised.${row.recognised}`)}
            </Badge>
          </li>
        ))}
      </ul>
      <div>
        <h3 className="text-md">{t('knowledge.classicalHeading')}</h3>
        {k.classical.length ? (
          <ul className="m-0 mt-2 list-none space-y-1 p-0">
            {k.classical.map((hit) => (
              <li key={hit.id} className="border-l-2 border-lac pl-3">
                {hit.label} <span className="text-muted">— {t(`knowledge.via.${hit.via}`)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-muted">{t('knowledge.classicalNone')}</p>
        )}
      </div>
      <ReasonList reasons={k.notes} />
      <p className="text-xs text-muted">{t('knowledge.category')}</p>
    </div>
  );
}

function PriorArtTab({ analysis }: { analysis: Analysis }) {
  const t = useTx();
  const text = useReasonText();
  const p = analysis.prior_art;
  return (
    <div className="space-y-5">
      {p.state === 'searched' ? (
        <p>{t('priorArt.searched', { count: p.record_count })}</p>
      ) : (
        <p className="rounded-control border-l-4 border-lac bg-lac/[0.05] p-3">
          {t(`priorArt.${p.state}`)}
        </p>
      )}
      {p.state === 'searched' && p.matches.length === 0 ? <p>{t('priorArt.noneFound')}</p> : null}
      {p.matches.map((match) => (
        <article key={match.record_id} className="rounded-data border border-rule bg-surface p-4">
          <header className="flex flex-wrap items-start justify-between gap-2">
            <h4 className="text-base">{match.title}</h4>
            <Badge tone={match.level === 'high' ? 'caution' : 'neutral'}>
              {t(`priorArt.level.${match.level}`)}
            </Badge>
          </header>
          <p className="text-xs text-muted">
            {[
              match.record_id,
              match.applicant,
              match.filing_date ? t('priorArt.filed', { date: match.filing_date }) : null,
              match.publication_date
                ? t('priorArt.published', { date: match.publication_date })
                : null,
              match.status,
            ]
              .filter(Boolean)
              .join(', ')}
          </p>
          <ul className="m-0 mt-2 list-none space-y-1 p-0">
            {match.why.map((reason) => (
              <li key={reason.code} className="rule-sourced text-base">
                {text(reason)}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted">{t('priorArt.record')}</p>
        </article>
      ))}
      <div>
        <h3 className="text-md">{t('priorArt.termsHeading')}</h3>
        <p className="mt-1">{p.searched_terms.join(', ')}</p>
      </div>
      <div>
        <h3 className="text-md">{t('priorArt.registriesHeading')}</h3>
        <p className="mt-1 text-xs text-muted">{t('priorArt.registriesNote')}</p>
        <ul className="m-0 mt-2 list-none space-y-1.5 p-0">
          {p.registries_not_searched.map((registry) => (
            <li key={registry.name} className="text-base">
              {registry.name} <span className="text-xs text-muted">— {registry.publisher}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function InventionTab({
  conversation,
  busy,
  onEdit,
}: {
  conversation: Conversation;
  busy: boolean;
  onEdit: (edit: InventionEdit) => void;
}) {
  const t = useTx();
  const inv = conversation.invention;
  const [editing, setEditing] = useState(false);
  const [rows, setRows] = useState<IngredientEdit[]>([]);
  const total = inv.ingredients.every((i) => (i.percent ?? i.percent_derived) !== null)
    ? inv.ingredients.reduce((sum, i) => sum + (i.percent ?? i.percent_derived ?? 0), 0)
    : null;

  function startEditing() {
    setRows(
      inv.ingredients.map((i) => ({
        name: i.name,
        percent: i.percent,
        amount_value: i.amount?.value ?? null,
        amount_unit: i.amount?.unit ?? null,
        purpose: i.purpose,
      })),
    );
    setEditing(true);
  }

  function update(index: number, patch: Partial<IngredientEdit>) {
    setRows((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  const notGiven = <span className="text-muted">{t('invention.notGiven')}</span>;
  const summary: [string, React.ReactNode][] = [
    [t('invention.title'), inv.title || notGiven],
    [t('invention.type'), inv.invention_type || notGiven],
    [t('invention.form'), inv.form ? inv.form.replace(/_/g, ' ') : notGiven],
    [t('invention.use'), inv.intended_use || notGiven],
    [t('invention.problem'), inv.problem || notGiven],
  ];

  const listSections = [
    ['process', inv.process_steps],
    ['parameters', inv.process_parameters],
    ['features', inv.distinctive_features],
  ] as const;

  return (
    <div className="space-y-6">
      <section>
        <h3 className="text-md">{t('invention.summary')}</h3>
        <dl className="m-0 mt-2 space-y-2">
          {summary.map(([label, value]) => (
            <div key={label} className="grid gap-x-4 sm:grid-cols-[10rem_1fr]">
              <dt className="text-xs text-muted">{label}</dt>
              <dd className="m-0">{value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-md">{t('invention.composition')}</h3>
          {!editing && inv.ingredients.length ? (
            <Button size="sm" variant="secondary" onClick={startEditing} disabled={busy}>
              {t('invention.edit')}
            </Button>
          ) : null}
        </div>
        {inv.batch_size ? (
          <p className="text-xs text-muted">
            {t('invention.batch', { amount: `${inv.batch_size.value} ${inv.batch_size.unit}` })}
          </p>
        ) : null}

        {editing ? (
          <form
            className="mt-3 space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              onEdit({ ingredients: rows.filter((row) => row.name.trim()) });
              setEditing(false);
            }}
          >
            {rows.map((row, index) => (
              <fieldset
                key={index}
                className="grid gap-2 rounded-control border border-rule p-3 sm:grid-cols-[2fr_1fr_2fr_auto]"
              >
                <legend className="sr-only">{row.name || t('invention.newRow')}</legend>
                <label className="text-xs text-muted">
                  {t('invention.columns.name')}
                  <input
                    className="mt-1 block w-full rounded-control border border-rule-strong bg-bone px-2 py-1.5 text-base text-ink"
                    value={row.name}
                    onChange={(event) => update(index, { name: event.target.value })}
                  />
                </label>
                <label className="text-xs text-muted">
                  {t('invention.columns.percent')}
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step="any"
                    className="mt-1 block w-full rounded-control border border-rule-strong bg-bone px-2 py-1.5 text-base text-ink"
                    value={row.percent ?? ''}
                    onChange={(event) =>
                      update(index, {
                        percent: event.target.value === '' ? null : Number(event.target.value),
                      })
                    }
                  />
                </label>
                <label className="text-xs text-muted">
                  {t('invention.columns.purpose')}
                  <input
                    className="mt-1 block w-full rounded-control border border-rule-strong bg-bone px-2 py-1.5 text-base text-ink"
                    value={row.purpose ?? ''}
                    onChange={(event) => update(index, { purpose: event.target.value || null })}
                  />
                </label>
                <button
                  type="button"
                  onClick={() => setRows((current) => current.filter((_, i) => i !== index))}
                  aria-label={t('invention.removeRow', { name: row.name || t('invention.newRow') })}
                  className="self-end rounded-data p-2 text-muted hover:bg-surface-sunk hover:text-lac"
                >
                  <X size={16} aria-hidden="true" />
                </button>
              </fieldset>
            ))}
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="quiet"
                onClick={() =>
                  setRows((current) => [
                    ...current,
                    {
                      name: '',
                      percent: null,
                      amount_value: null,
                      amount_unit: null,
                      purpose: null,
                    },
                  ])
                }
              >
                <Plus size={14} aria-hidden="true" />
                {t('invention.addRow')}
              </Button>
              <Button size="sm" type="submit" disabled={busy}>
                {t('invention.save')}
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setEditing(false)}>
                {t('invention.cancel')}
              </Button>
            </div>
          </form>
        ) : inv.ingredients.length ? (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[26rem] border-collapse text-base">
              <thead>
                <tr className="border-b border-rule-strong text-left">
                  {COMPOSITION_COLUMNS.map((column) => (
                    <th
                      key={column}
                      scope="col"
                      className="py-1.5 pr-3 text-xs font-medium text-muted"
                    >
                      {t(`invention.columns.${column}`)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {inv.ingredients.map((i) => (
                  <tr key={i.key} className="border-b border-rule-faint align-top">
                    <th scope="row" className="py-1.5 pr-3 text-left font-normal">
                      {i.name}
                    </th>
                    <td className="py-1.5 pr-3">
                      {i.amount ? `${i.amount.value} ${i.amount.unit}` : ''}
                    </td>
                    <td className="py-1.5 pr-3">
                      {i.percent !== null ? (
                        pct(i.percent)
                      ) : i.percent_derived !== null ? (
                        <span title={t('invention.derived')}>{pct(i.percent_derived)}*</span>
                      ) : (
                        ''
                      )}
                    </td>
                    <td className="py-1.5 text-muted">{i.purpose ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {total !== null ? (
              <p className="mt-1 text-xs text-muted">
                {t('invention.total', { total: Math.round(total * 100) / 100 })}
              </p>
            ) : null}
          </div>
        ) : (
          <p className="mt-2 text-muted">{t('invention.notGiven')}</p>
        )}
      </section>

      {listSections.map(([key, items]) =>
        items.length ? (
          <section key={key}>
            <h3 className="text-md">{t(`invention.${key}`)}</h3>
            <ul className="m-0 mt-2 list-disc space-y-1 pl-5">
              {items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>
        ) : null,
      )}

      <dl className="m-0 space-y-2">
        {inv.evidence ? (
          <div>
            <dt className="text-xs text-muted">{t('invention.evidence')}</dt>
            <dd className="m-0">{inv.evidence}</dd>
          </div>
        ) : null}
        {inv.disclosure ? (
          <div>
            <dt className="text-xs text-muted">{t('invention.disclosure')}</dt>
            <dd className="m-0">{t(`invention.disclosureValue.${inv.disclosure}`)}</dd>
          </div>
        ) : null}
        {inv.brand_name ? (
          <div>
            <dt className="text-xs text-muted">{t('invention.brand')}</dt>
            <dd className="m-0">{inv.brand_name}</dd>
          </div>
        ) : null}
      </dl>
    </div>
  );
}

const TABS = ['assessment', 'products', 'knowledge', 'priorArt', 'invention'] as const;
const INVENTION_ONLY = ['invention'] as const;
type TabId = (typeof TABS)[number];

export function Findings({
  conversation,
  busy,
  onEdit,
  onRerun,
}: {
  conversation: Conversation;
  busy: boolean;
  onEdit: (edit: InventionEdit) => void;
  onRerun: () => void;
}) {
  const t = useTx();
  const idBase = useId();
  const analysis = conversation.analysis;
  const [tab, setTab] = useState<TabId>(analysis ? 'assessment' : 'invention');
  const active: TabId = analysis ? tab : 'invention';

  const counts: Partial<Record<TabId, number>> = analysis
    ? {
        products: analysis.products.matches.length,
        priorArt: analysis.prior_art.matches.length,
      }
    : {};

  return (
    <section
      aria-labelledby="findings-heading"
      className="min-w-0 rounded-data border border-rule bg-bone p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="findings-heading" className="text-lg">
          {t('findings.heading')}
        </h2>
        {analysis ? (
          <Button size="sm" variant="secondary" onClick={onRerun} disabled={busy}>
            {t('findings.rerun')}
          </Button>
        ) : null}
      </div>
      {analysis ? (
        <p className="mt-1 text-xs text-muted">
          {t('findings.updated', {
            when: new Date(analysis.created_at * 1000).toLocaleString(),
            trigger: t(`findings.trigger.${analysis.trigger}`, { defaultValue: analysis.trigger }),
          })}
        </p>
      ) : (
        <div className="mt-3">
          <p className="text-muted">{t('findings.empty')}</p>
        </div>
      )}

      <Tabs
        aria-label={t('findings.tabsLabel')}
        idBase={idBase}
        className="mt-4 flex-wrap"
        items={(analysis ? TABS : INVENTION_ONLY).map((id) => ({
          id,
          label: t(`findings.tabs.${id}`),
          ...(counts[id] !== undefined ? { count: counts[id] } : {}),
        }))}
        value={active}
        onChange={(id) => setTab(id as TabId)}
      />

      <div className="pt-5">
        {analysis ? (
          <>
            <TabPanel id="assessment" idBase={idBase} active={active === 'assessment'}>
              <AssessmentTab analysis={analysis} />
              {conversation.history.length > 1 ? (
                <div className="mt-6">
                  <h3 className="text-base font-medium">{t('findings.historyHeading')}</h3>
                  <ul className="m-0 mt-2 list-none space-y-1 p-0 text-xs text-muted">
                    {conversation.history.map((run) => (
                      <li key={run.id}>
                        {new Date(run.created_at * 1000).toLocaleString()} —{' '}
                        {t('findings.historyRow', {
                          indicator: t(`indicator.${run.indicator}.label`),
                          products: run.product_matches,
                          patents: run.patent_matches,
                        })}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </TabPanel>
            <TabPanel id="products" idBase={idBase} active={active === 'products'}>
              <ProductsTab analysis={analysis} />
            </TabPanel>
            <TabPanel id="knowledge" idBase={idBase} active={active === 'knowledge'}>
              <KnowledgeTab analysis={analysis} />
            </TabPanel>
            <TabPanel id="priorArt" idBase={idBase} active={active === 'priorArt'}>
              <PriorArtTab analysis={analysis} />
            </TabPanel>
          </>
        ) : null}
        <TabPanel id="invention" idBase={idBase} active={active === 'invention'}>
          <InventionTab conversation={conversation} busy={busy} onEdit={onEdit} />
        </TabPanel>
      </div>
    </section>
  );
}
