import { Plus, X } from 'lucide-react';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ChoiceCard, ChoiceGroup, FieldError, TextField } from '@/components/assessment/fields';
import { Button } from '@/components/ui';
import { cn } from '@/lib/cn';
import {
  CATEGORIES,
  CONFIDENTIAL,
  NOVELTY,
  recogniseIngredient,
  WORKS,
  type AssessmentInput,
  type Errors,
  type Novelty,
} from '@/services/assessment';

/**
 * The four steps a reader fills in. Each renders its own question as the step's
 * heading, which the page focuses when the step arrives.
 */
export interface StepProps {
  input: AssessmentInput;
  update: (patch: Partial<AssessmentInput>) => void;
  errors: Errors;
  headingRef: React.RefObject<HTMLHeadingElement>;
}

export function StepHeading({
  headingRef,
  title,
  hint,
}: {
  headingRef: React.RefObject<HTMLHeadingElement>;
  title: string;
  hint?: string;
}) {
  return (
    <div className="mb-6">
      <h2 ref={headingRef} tabIndex={-1} className="text-lg outline-none">
        {title}
      </h2>
      {hint ? <p className="mt-2 text-muted">{hint}</p> : null}
    </div>
  );
}

function useError() {
  const { t } = useTranslation('assessment');
  return (errors: Errors, field: string) => {
    const code = errors[field];
    return code ? t(`errors.${code}`) : undefined;
  };
}

const YES_NO = ['yes', 'no'] as const;
const DISCLOSED = ['yes', 'no', 'unsure'] as const;

function toggle<T>(list: readonly T[], value: T): T[] {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

// -- 1 ----------------------------------------------------------------------

export function CategoryStep({ input, update, errors, headingRef }: StepProps) {
  const { t } = useTranslation('assessment');
  const error = useError();

  return (
    <>
      <StepHeading headingRef={headingRef} title={t('category.question')} hint={t('category.hint')} />
      <ChoiceGroup
        id="field-category"
        legend={t('steps.category')}
        error={error(errors, 'category')}
        className="sm:grid-cols-2"
      >
        {CATEGORIES.map((category) => (
          <ChoiceCard
            key={category}
            type="radio"
            name="category"
            checked={input.category === category}
            onChange={() => update({ category })}
            label={t(`category.options.${category}.label`)}
            detail={t(`category.options.${category}.examples`)}
          />
        ))}
      </ChoiceGroup>
    </>
  );
}

// -- 2 ----------------------------------------------------------------------

export function DetailsStep({ input, update, errors, headingRef }: StepProps) {
  const { t } = useTranslation('assessment');
  const error = useError();
  const optional = t('details.optional');

  return (
    <>
      <StepHeading headingRef={headingRef} title={t('details.question')} hint={t('details.hint')} />
      <div className="space-y-6">
        <TextField
          id="field-name"
          label={t('details.name')}
          hint={t('details.nameHint')}
          value={input.name}
          onChange={(name) => update({ name })}
          error={error(errors, 'name')}
        />
        <TextField
          id="field-purpose"
          label={t('details.purpose')}
          hint={t('details.purposeHint')}
          value={input.purpose}
          onChange={(purpose) => update({ purpose })}
          error={error(errors, 'purpose')}
          multiline
          rows={2}
        />
        <TextField
          id="field-problem"
          label={t('details.problem')}
          optionalLabel={optional}
          value={input.problem}
          onChange={(problem) => update({ problem })}
          error={error(errors, 'problem')}
          multiline
          rows={2}
        />
        <TextField
          id="field-difference"
          label={t('details.difference')}
          hint={t('details.differenceHint')}
          optionalLabel={optional}
          value={input.difference}
          onChange={(difference) => update({ difference })}
          error={error(errors, 'difference')}
          multiline
          rows={3}
        />
        <TextField
          id="field-users"
          label={t('details.users')}
          hint={t('details.usersHint')}
          optionalLabel={optional}
          value={input.users}
          onChange={(users) => update({ users })}
          error={error(errors, 'users')}
        />
      </div>
    </>
  );
}

// -- 3 ----------------------------------------------------------------------

export function IngredientsStep({ input, update, errors, headingRef }: StepProps) {
  const { t } = useTranslation('assessment');
  const error = useError();
  const [draft, setDraft] = useState('');
  const listId = useId();

  function add() {
    const value = draft.trim().replace(/\s+/g, ' ');
    if (!value) return;
    const exists = input.ingredients.some((entry) => entry.toLowerCase() === value.toLowerCase());
    if (!exists) update({ ingredients: [...input.ingredients, value] });
    setDraft('');
  }

  // "Nothing new" and a claimed novelty cannot both be true, so choosing one
  // clears the other rather than leaving an error to explain.
  function pick(novelty: Novelty) {
    if (novelty === 'none') {
      update({ novelty: input.novelty.includes('none') ? [] : ['none'] });
    } else {
      update({ novelty: toggle(input.novelty.filter((n) => n !== 'none'), novelty) });
    }
  }

  const anyKnown = input.ingredients.some((entry) => recogniseIngredient(entry) !== null);

  return (
    <>
      <StepHeading
        headingRef={headingRef}
        title={t('ingredients.question')}
        hint={t('ingredients.hint')}
      />

      <div>
        <label htmlFor="field-ingredients" className="block text-base font-medium text-ink">
          {t('ingredients.inputLabel')}
        </label>
        <div className="mt-2 flex gap-2">
          <input
            id="field-ingredients"
            type="text"
            value={draft}
            autoComplete="off"
            aria-invalid={errors.ingredients ? true : undefined}
            aria-describedby={errors.ingredients ? 'field-ingredients-error' : undefined}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                add();
              }
            }}
            className={cn(
              'min-w-0 flex-1 rounded-control border bg-surface px-3 py-2 text-base text-ink',
              'transition-colors duration-quick ease-incise hover:border-ink/60',
              errors.ingredients ? 'border-lac' : 'border-rule-strong',
            )}
          />
          <Button variant="secondary" onClick={add} className="shrink-0">
            <Plus size={16} aria-hidden="true" />
            {t('ingredients.add')}
          </Button>
        </div>
        <FieldError id="field-ingredients" message={error(errors, 'ingredients')} />

        {input.ingredients.length > 0 ? (
          <ul aria-label={t('ingredients.listLabel')} id={listId} className="m-0 mt-4 list-none space-y-2 p-0">
            {input.ingredients.map((entry) => {
              const known = recogniseIngredient(entry);
              return (
                <li
                  key={entry}
                  className="route-swap flex items-center justify-between gap-3 rounded-control border border-rule bg-surface px-3 py-2"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-base text-ink">{entry}</span>
                    <span className={cn('block text-xs', known ? 'text-leaf' : 'text-muted')}>
                      {known ? `${t('ingredients.known')} — ${known.label}` : t('ingredients.unknown')}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => update({ ingredients: input.ingredients.filter((i) => i !== entry) })}
                    aria-label={t('ingredients.remove', { name: entry })}
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-control text-muted transition-colors duration-quick ease-incise hover:bg-surface-sunk hover:text-ink"
                  >
                    <X size={16} aria-hidden="true" />
                  </button>
                </li>
              );
            })}
          </ul>
        ) : null}

        {anyKnown ? (
          <p className="mt-3 border-l-2 border-leaf pl-3 text-xs text-muted">
            {t('ingredients.knownNote')}
          </p>
        ) : null}
      </div>

      <div className="mt-8">
        <TextField
          id="field-formulation"
          label={t('ingredients.formulation')}
          hint={t('ingredients.formulationHint')}
          optionalLabel={t('details.optional')}
          value={input.formulation}
          onChange={(formulation) => update({ formulation })}
          error={error(errors, 'formulation')}
          multiline
          rows={3}
        />
      </div>

      <div className="mt-8">
        <ChoiceGroup
          id="field-novelty"
          legend={t('ingredients.noveltyQuestion')}
          hint={t('ingredients.noveltyHint')}
          error={error(errors, 'novelty')}
        >
          {NOVELTY.map((novelty) => (
            <ChoiceCard
              key={novelty}
              type="checkbox"
              name="novelty"
              checked={input.novelty.includes(novelty)}
              onChange={() => pick(novelty)}
              label={t(`ingredients.novelty.${novelty}.label`)}
              detail={t(`ingredients.novelty.${novelty}.detail`)}
            />
          ))}
        </ChoiceGroup>
      </div>
    </>
  );
}

// -- 4 ----------------------------------------------------------------------

export function ProtectionStep({ input, update, errors, headingRef }: StepProps) {
  const { t } = useTranslation('assessment');
  const error = useError();

  return (
    <>
      <StepHeading
        headingRef={headingRef}
        title={t('protection.question')}
        hint={t('protection.hint')}
      />
      <div className="space-y-8">
        <ChoiceGroup
          id="field-brand"
          legend={t('protection.brand')}
          error={error(errors, 'brand')}
          className="grid-cols-2 sm:max-w-sm"
        >
          {YES_NO.map((value) => (
            <ChoiceCard
              key={value}
              type="radio"
              name="brand"
              checked={input.brand === value}
              onChange={() => update({ brand: value })}
              label={t(`protection.${value}`)}
            />
          ))}
        </ChoiceGroup>

        <ChoiceGroup
          id="field-works"
          legend={t('protection.works')}
          hint={t('protection.worksHint')}
          className="sm:grid-cols-2"
        >
          {WORKS.map((work) => (
            <ChoiceCard
              key={work}
              type="checkbox"
              name="works"
              checked={input.works.includes(work)}
              onChange={() => update({ works: toggle(input.works, work) })}
              label={t(`protection.work.${work}`)}
            />
          ))}
        </ChoiceGroup>

        <ChoiceGroup
          id="field-confidential"
          legend={t('protection.confidential')}
          hint={t('protection.confidentialHint')}
          className="sm:grid-cols-2"
        >
          {CONFIDENTIAL.map((item) => (
            <ChoiceCard
              key={item}
              type="checkbox"
              name="confidential"
              checked={input.confidential.includes(item)}
              onChange={() => update({ confidential: toggle(input.confidential, item) })}
              label={t(`protection.secret.${item}`)}
            />
          ))}
        </ChoiceGroup>

        <ChoiceGroup
          id="field-disclosed"
          legend={t('protection.disclosed')}
          hint={t('protection.disclosedHint')}
          error={error(errors, 'disclosed')}
          className="sm:grid-cols-3"
        >
          {DISCLOSED.map((value) => (
            <ChoiceCard
              key={value}
              type="radio"
              name="disclosed"
              checked={input.disclosed === value}
              onChange={() => update({ disclosed: value })}
              label={t(`protection.${value}`)}
            />
          ))}
        </ChoiceGroup>
      </div>
    </>
  );
}
