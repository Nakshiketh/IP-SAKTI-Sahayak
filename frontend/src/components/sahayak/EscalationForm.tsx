import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button, Drawer } from '@/components/ui';
import type { QueryResult } from '@/services/query';

/**
 * Handing the question to a person.
 *
 * There is no expert network behind this, and the copy says so. What it does is
 * the part that is actually useful: package the question, the jurisdiction, the
 * product type and every source the system looked at into a summary someone can
 * paste into an email. Faking a queue would be worse than offering nothing.
 */
interface EscalationFormProps {
  open: boolean;
  onClose: () => void;
  result: QueryResult;
  productClass: string;
}

export function EscalationForm({ open, onClose, result, productClass }: EscalationFormProps) {
  const { t } = useTranslation('sahayak');
  const { t: tc } = useTranslation('common');
  const [copied, setCopied] = useState(false);

  // What this answer actually cited. Where it abstained there is nothing to
  // list, and the summary says so rather than listing what was searched.
  const citations = result.answer?.citations ?? [];
  const summary = [
    `${t('answer.questionLabel')}: ${result.question}`,
    `${t('jurisdictionLabel')}: ${tc(`jurisdiction.${result.jurisdiction}`)}`,
    `${t('context.changeProduct')}: ${productClass}`,
    `${tc('answer.sourcesHeading')}:`,
    ...citations.map(
      (citation, index) =>
        `  [${index + 1}] ${citation.document_title}, ${citation.organization}` +
        (citation.section_label ? ` — ${citation.section_label}` : ''),
    ),
    '',
    tc('footer.disclaimer'),
  ].join('\n');

  async function copy() {
    try {
      await navigator.clipboard.writeText(summary);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can be refused. The textarea below is selectable, so
      // the reader is not stuck; saying nothing is better than a false success.
      setCopied(false);
    }
  }

  return (
    <Drawer open={open} onClose={onClose} title={t('escalate.title')}>
      <p className="max-w-none text-base">{t('escalate.intro')}</p>

      <p className="mt-4 text-xs text-muted">{t('escalate.summaryLabel')}</p>
      <textarea
        readOnly
        value={summary}
        rows={14}
        aria-label={t('escalate.summaryLabel')}
        className="mt-1.5 w-full resize-y rounded-control border border-rule-strong bg-surface p-3 font-mono text-xs"
      />

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button onClick={copy}>{copied ? t('escalate.copied') : t('escalate.copy')}</Button>
      </div>

      <p className="mt-4 text-xs text-muted">{t('escalate.channels')}</p>
    </Drawer>
  );
}
