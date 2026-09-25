import { CornerDownRight, MessageSquare } from 'lucide-react';
import { useTranslation } from 'react-i18next';

/**
 * The conversation so far, and an honest account of what it is.
 *
 * This is a thread, not a memory. Every question goes through the pipeline on
 * its own evidence: nothing from an earlier turn changes what the corpus
 * returns for a later one, and no state is carried on the server. A chat
 * interface that implied otherwise would be the most expensive kind of lie
 * here — a reader would take a later answer as having accounted for something
 * they said three turns ago, and act on it.
 *
 * So follow-ups carry their context *visibly*. When a reader asks "what about
 * the trade mark?", what gets sent is the earlier question and that one
 * together, and the thread shows exactly the text that was sent. Nothing is
 * appended behind their back, and nothing is remembered that they cannot see.
 *
 * Each turn keeps its outcome beside it — answered, or declined, and at what
 * confidence — because a thread of questions with the failures quietly dropped
 * would read as a product that always answers.
 */

export interface Turn {
  id: number;
  question: string;
  /** What actually went to the pipeline: the question, plus any carried context. */
  sent: string;
  outcome: 'answered' | 'declined' | 'failed';
  confidence: string | null;
  sources: number;
}

export function ConversationThread({
  turns,
  currentId,
  onRevisit,
}: {
  turns: Turn[];
  currentId: number | null;
  onRevisit: (turn: Turn) => void;
}) {
  const { t } = useTranslation('sahayak');
  if (turns.length <= 1) return null;

  return (
    <section className="mt-6 border-t border-rule pt-4">
      <h2 className="flex items-center gap-2 text-base">
        <MessageSquare size={16} aria-hidden="true" />
        {t('thread.heading')}
      </h2>
      <p className="mt-2 max-w-measure text-xs text-muted">{t('thread.note')}</p>

      <ol className="m-0 mt-3 list-none space-y-2 p-0">
        {turns.map((turn) => (
          <li key={turn.id}>
            <button
              type="button"
              onClick={() => onRevisit(turn)}
              aria-current={turn.id === currentId ? 'true' : undefined}
              className={`w-full border-l-2 pl-3 text-left ${
                turn.id === currentId ? 'border-ink' : 'border-rule'
              }`}
            >
              <span className="block text-base">{turn.question}</span>
              <span className="mt-0.5 block text-xs text-muted">
                {turn.outcome === 'answered'
                  ? t('thread.answered', { confidence: turn.confidence, count: turn.sources })
                  : turn.outcome === 'declined'
                    ? t('thread.declined')
                    : t('thread.failed')}
              </span>
              {/* Shown only when the two differ, which is exactly when a reader
                  needs to see it: the follow-up carried something. */}
              {turn.sent !== turn.question ? (
                <span className="mt-1 flex items-start gap-1 text-xs text-muted">
                  <CornerDownRight size={12} aria-hidden="true" className="mt-0.5 shrink-0" />
                  {t('thread.carried')}
                </span>
              ) : null}
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}

export default ConversationThread;
