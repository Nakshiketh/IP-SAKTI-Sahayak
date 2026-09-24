import { Loader2, SendHorizontal, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { Findings } from '@/components/analyst/Findings';
import { ProtectionMap } from '@/components/answer/ProtectionMap';
import { Journey, type StageState } from '@/components/analyst/Journey';
import { Badge, Button, Chip, LiveRegion } from '@/components/ui';
import { useDocumentMeta } from '@/hooks/useDocumentMeta';
import { cn } from '@/lib/cn';
import {
  AnalystError,
  createConversation,
  deleteConversation,
  getConversation,
  getStatus,
  listConversations,
  sendTurn,
  STAGE_IDS,
  type AnalystErrorCode,
  type AnalystStatus,
  type Conversation,
  type ConversationSummary,
  type InventionEdit,
  type StageId,
  type TurnInput,
} from '@/services/analyst';

/**
 * Analyse my invention: a conversation on the left, the findings on the right.
 *
 * The reader describes the invention in their own words; the analyst asks only
 * for what is still missing, runs the analysis as soon as it can, and re-runs
 * only what a change affects. The journey strip reports the stages the server
 * streams, as they finish.
 */

const IDLE: Record<StageId, StageState> = Object.fromEntries(
  STAGE_IDS.map((id) => [id, 'idle']),
) as Record<StageId, StageState>;

function MessageText({ text }: { text: string }) {
  return (
    <div className="space-y-2">
      {text.split(/\n{2,}/).map((block, index) => {
        const lines = block.split('\n');
        const items = lines.filter((line) => line.startsWith('- '));
        const lead = lines.filter((line) => !line.startsWith('- '));
        return (
          <div key={index}>
            {lead.map((line, i) => (
              <p key={i} className="max-w-none">
                {line}
              </p>
            ))}
            {items.length ? (
              <ul className="m-0 mt-1 list-disc space-y-1 pl-5">
                {items.map((line, i) => (
                  <li key={i}>{line.slice(2)}</li>
                ))}
              </ul>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

export default function Analyst() {
  const { t } = useTranslation('analyst');
  useDocumentMeta(t('meta.title'), t('meta.description'));

  const [status, setStatus] = useState<AnalystStatus | null>(null);
  const [list, setList] = useState<ConversationSummary[]>([]);
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [stages, setStages] = useState<Record<StageId, StageState>>(IDLE);
  const [error, setError] = useState<AnalystErrorCode | null>(null);
  const [lastInput, setLastInput] = useState<TurnInput | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const threadRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);

  const fail = (caught: unknown) =>
    setError(caught instanceof AnalystError ? caught.code : 'unknown');

  const refreshList = useCallback(async () => {
    try {
      setList(await listConversations());
    } catch {
      /* the list is a convenience; the open analysis still works */
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [found, info] = await Promise.all([
          listConversations(),
          getStatus().catch(() => null),
        ]);
        if (cancelled) return;
        setStatus(info);
        setList(found);
        const next = found[0] ? await getConversation(found[0].id) : await createConversation();
        if (!cancelled) setConversation(next);
        if (!found[0]) void refreshList();
      } catch (caught) {
        if (!cancelled) fail(caught);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshList]);

  useEffect(() => {
    const thread = threadRef.current;
    if (thread) thread.scrollTop = thread.scrollHeight;
  }, [conversation?.messages?.length, pending]);

  async function run(input: TurnInput) {
    if (!conversation || busy) return;
    setBusy(true);
    setError(null);
    setLastInput(input);
    setPending('text' in input ? input.text : null);
    setStages({ ...IDLE, understand: 'active' });
    try {
      const next = await sendTurn(conversation.id, input, (stage) => {
        setStages((current) => {
          const updated = { ...current, [stage.id]: stage.ran ? 'done' : 'reused' } as Record<
            StageId,
            StageState
          >;
          const following = STAGE_IDS[STAGE_IDS.indexOf(stage.id) + 1];
          if (following && updated[following] === 'idle') updated[following] = 'active';
          return updated;
        });
      });
      setConversation(next);
      if ('text' in input) setDraft('');
      void refreshList();
    } catch (caught) {
      fail(caught);
      if ('text' in input) setDraft(input.text);
    } finally {
      setPending(null);
      setBusy(false);
      setStages(
        (current) =>
          Object.fromEntries(
            STAGE_IDS.map((id) => [id, current[id] === 'active' ? 'idle' : current[id]]),
          ) as Record<StageId, StageState>,
      );
    }
  }

  function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed) return;
    if (/^run the analysis again$/i.test(trimmed)) void run({ rerun: true });
    else void run({ text: trimmed });
  }

  async function open(id: string) {
    setError(null);
    try {
      setConversation(await getConversation(id));
      setStages(IDLE);
    } catch (caught) {
      fail(caught);
    }
  }

  async function startNew() {
    setError(null);
    try {
      setConversation(await createConversation());
      setStages(IDLE);
      void refreshList();
      composerRef.current?.focus();
    } catch (caught) {
      fail(caught);
    }
  }

  async function remove() {
    if (!conversation) return;
    try {
      await deleteConversation(conversation.id);
      setConfirmDelete(false);
      const remaining = list.filter((item) => item.id !== conversation.id);
      setList(remaining);
      setConversation(
        remaining[0] ? await getConversation(remaining[0].id) : await createConversation(),
      );
    } catch (caught) {
      fail(caught);
    }
  }

  const lastAssistant = [...(conversation?.messages ?? [])]
    .reverse()
    .find((m) => m.role === 'assistant');
  const lastUser = [...(conversation?.messages ?? [])].reverse().find((m) => m.role === 'user');
  const suggestions = busy ? [] : (lastAssistant?.meta.suggestions ?? []);
  const showJourney = busy || Boolean(conversation?.analysis);

  return (
    <article className="mx-auto max-w-[80rem] px-5 py-10">
      <header className="border-b border-rule-strong pb-6">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl">{t('heading')}</h1>
          <Badge tone="caution">{t('label')}</Badge>
        </div>
        <p className="mt-3 max-w-measure text-md text-muted">{t('standfirst')}</p>
        <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-1 text-xs text-muted">
          {status ? (
            <span>{t(status.engine === 'model' ? 'engineModel' : 'engineRules')}</span>
          ) : null}
          <Link to="/assess/steps" className="text-leaf underline underline-offset-4">
            {t('stepsLink')}
          </Link>
        </div>
      </header>

      {showJourney ? (
        <Journey stages={stages} busy={busy} complete={Boolean(conversation?.analysis)} />
      ) : null}

      <LiveRegion urgency="polite" visuallyHidden>
        {busy ? t('chat.busy') : ''}
      </LiveRegion>

      {error ? (
        <div
          role="alert"
          className="mt-6 flex flex-wrap items-center gap-3 rounded-control border border-lac/40 bg-lac/[0.05] p-3"
        >
          <p className="text-lac">{t(`errors.${error}`)}</p>
          {lastInput && error !== 'session' ? (
            <Button size="sm" variant="secondary" onClick={() => void run(lastInput)}>
              {t('errors.retry')}
            </Button>
          ) : null}
        </div>
      ) : null}

      <div className="mt-6 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <section
          aria-labelledby="chat-heading"
          className="flex min-w-0 flex-col rounded-data border border-rule bg-bone"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-rule px-4 py-3">
            <h2 id="chat-heading" className="text-lg">
              {t('chat.heading')}
            </h2>
            <div className="flex flex-wrap items-center gap-2">
              {list.length > 1 ? (
                <label className="flex items-center gap-2 text-xs text-muted">
                  {t('history.label')}
                  <select
                    className="max-w-[12rem] rounded-control border border-rule-strong bg-bone px-2 py-1 text-xs text-ink"
                    value={conversation?.id ?? ''}
                    onChange={(event) => void open(event.target.value)}
                  >
                    {list.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.title}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              <Button size="sm" variant="secondary" onClick={() => void startNew()} disabled={busy}>
                {t('history.new')}
              </Button>
            </div>
          </div>

          <div
            ref={threadRef}
            className="max-h-[36rem] min-h-[18rem] space-y-4 overflow-y-auto px-4 py-4"
            aria-live="off"
          >
            {(conversation?.messages ?? []).map((message) => (
              <div
                key={message.id}
                className={cn(
                  'max-w-[92%] rounded-control px-3 py-2',
                  message.role === 'user'
                    ? 'ml-auto border border-leaf/30 bg-leaf/[0.06]'
                    : 'border border-rule bg-surface',
                )}
              >
                <p className="text-xs text-muted">
                  {message.role === 'user' ? t('chat.you') : t('chat.analyst')}
                </p>
                <MessageText text={message.text} />
                {message.meta.ask_link && lastUser ? (
                  <Link
                    to={`/sahayak?q=${encodeURIComponent(lastUser.text)}`}
                    className="mt-2 inline-block text-leaf underline underline-offset-4"
                  >
                    {t('chat.askLink')}
                  </Link>
                ) : null}
              </div>
            ))}
            {pending ? (
              <div className="ml-auto max-w-[92%] rounded-control border border-leaf/30 bg-leaf/[0.06] px-3 py-2 opacity-70">
                <p className="text-xs text-muted">{t('chat.you')}</p>
                <MessageText text={pending} />
              </div>
            ) : null}
            {busy ? (
              <p className="flex items-center gap-2 text-muted" aria-hidden="true">
                <Loader2 size={14} className="animate-spin" />
                {t('chat.busy')}
              </p>
            ) : null}
          </div>

          <div className="border-t border-rule px-4 py-3">
            {suggestions.length || !conversation?.invention.ingredients.length ? (
              <ul
                aria-label={t('chat.suggestionsLabel')}
                className="m-0 mb-3 flex list-none flex-wrap gap-2 p-0"
              >
                {suggestions.map((suggestion) => (
                  <li key={suggestion}>
                    <Chip onClick={() => send(suggestion)}>{suggestion}</Chip>
                  </li>
                ))}
                {!conversation?.invention.ingredients.length ? (
                  <li>
                    <Chip onClick={() => setDraft(t('sample'))}>{t('chat.sample')}</Chip>
                  </li>
                ) : null}
              </ul>
            ) : null}
            <form
              onSubmit={(event) => {
                event.preventDefault();
                send(draft);
              }}
            >
              <label htmlFor="analyst-composer" className="text-xs text-muted">
                {t('chat.composerLabel')}
              </label>
              <div className="mt-1 flex items-end gap-2">
                <textarea
                  id="analyst-composer"
                  ref={composerRef}
                  rows={3}
                  value={draft}
                  maxLength={4000}
                  disabled={!conversation}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault();
                      send(draft);
                    }
                  }}
                  aria-describedby="analyst-composer-hint"
                  className="min-h-[4.5rem] flex-1 resize-y rounded-control border border-rule-strong bg-surface px-3 py-2 text-base text-ink"
                />
                <Button type="submit" disabled={busy || !draft.trim() || !conversation}>
                  <SendHorizontal size={16} aria-hidden="true" />
                  {t('chat.send')}
                </Button>
              </div>
              <p id="analyst-composer-hint" className="mt-1 text-xs text-muted">
                {t('chat.composerHint')}
              </p>
            </form>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-rule px-4 py-3 text-xs text-muted">
            <p className="max-w-measure">{t('history.stored')}</p>
            {conversation ? (
              confirmDelete ? (
                <span className="flex gap-2">
                  <Button size="sm" variant="danger" onClick={() => void remove()}>
                    {t('history.confirmDelete')}
                  </Button>
                  <Button size="sm" variant="quiet" onClick={() => setConfirmDelete(false)}>
                    {t('history.cancel')}
                  </Button>
                </span>
              ) : (
                <Button
                  size="sm"
                  variant="quiet"
                  onClick={() => setConfirmDelete(true)}
                  disabled={busy}
                >
                  <Trash2 size={14} aria-hidden="true" />
                  {t('history.delete')}
                </Button>
              )
            ) : null}
          </div>
        </section>

        {conversation ? (
          <Findings
            conversation={conversation}
            busy={busy}
            onEdit={(edit: InventionEdit) => void run({ edit })}
            onRerun={() => void run({ rerun: true })}
          />
        ) : null}

        {/* Added below the existing findings rather than inside them: the
            protection map answers a different question — what you could hold —
            and the sections above answer what was found. */}
        {conversation?.analysis?.intelligence?.protection?.length ? (
          <ProtectionMap className="mt-8" entries={conversation.analysis.intelligence.protection} />
        ) : null}
      </div>
    </article>
  );
}
