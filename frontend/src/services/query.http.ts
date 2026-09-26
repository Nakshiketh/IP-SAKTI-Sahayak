import {
  QueryError,
  type QueryErrorCode,
  type QueryOptions,
  type QueryResult,
  type StageTiming,
} from '@/services/query';
import { isOffline, withBackoff } from '@/services/retry';
import { apiFetch } from '@/lib/http';

/**
 * The API client. Reads a newline-delimited JSON stream.
 *
 * Streaming rather than one response because the interface has something honest
 * to show while the work happens: the stages as they finish, and the count of
 * what retrieval found as soon as it is known. Those callbacks are the reason
 * the status line is a report rather than an animation.
 *
 * A cross-border question sends two `result` events. This client resolves with
 * the one matching the jurisdiction that was asked for, and the workspace asks
 * again for the other side when the reader switches — rather than holding a
 * second answer the reader has not asked to see, which is how two answer sets
 * start looking like one.
 */

interface StageMessage {
  event: 'stage';
  id: StageTiming['id'];
  ms: number;
}

interface RetrievedMessage {
  event: 'retrieved';
  passages: number;
  documents: number;
}

interface ErrorMessage {
  event: 'error';
  code: string;
  message: string;
}

type ResultMessage = { event: 'result' } & QueryResult;
type Message = StageMessage | RetrievedMessage | ResultMessage | ErrorMessage;

/**
 * How long to wait for the server before calling it a timeout.
 *
 * Long enough for a hard seven-part question on a slow connection — the
 * flagship case runs seven retrievals — and short enough that the reader gets a
 * decision rather than an indefinite spinner.
 */
const REQUEST_TIMEOUT_MS = 45_000;

/** One signal that aborts when any of the given signals does. */
function anySignal(signals: AbortSignal[]): AbortSignal {
  const controller = new AbortController();
  for (const signal of signals) {
    if (signal.aborted) {
      controller.abort();
      break;
    }
    signal.addEventListener('abort', () => controller.abort(), { once: true });
  }
  return controller.signal;
}

const ERROR_CODES = new Set<QueryErrorCode>([
  'generation_unavailable',
  'rate_limited',
  'request_too_large',
  'question_too_long',
]);

function toErrorCode(code: string): QueryErrorCode {
  return ERROR_CODES.has(code as QueryErrorCode) ? (code as QueryErrorCode) : 'unknown';
}

/** Split a stream into whole lines, holding the partial one back. */
async function* lines(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffered = '';

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffered += decoder.decode(value, { stream: true });
      let newline = buffered.indexOf('\n');
      while (newline !== -1) {
        const line = buffered.slice(0, newline).trim();
        buffered = buffered.slice(newline + 1);
        if (line) yield line;
        newline = buffered.indexOf('\n');
      }
    }
    const rest = buffered.trim();
    if (rest) yield rest;
  } finally {
    reader.releaseLock();
  }
}

export async function runHttpQuery(question: string, options: QueryOptions): Promise<QueryResult> {
  // Said before trying, not after failing. A reader with no network gets the
  // real reason immediately instead of three silent waits and a vaguer message.
  if (isOffline()) {
    throw new QueryError('offline', 'This device is not connected.');
  }

  // A request that never answers is worse than one that fails: the reader sits
  // with a spinner and no idea whether to wait. Long enough for a hard
  // multi-part question on a slow connection, short enough to be a decision
  // rather than an abandonment.
  const deadline = new AbortController();
  const timer = setTimeout(() => deadline.abort(), REQUEST_TIMEOUT_MS);
  const signal = options.signal ? anySignal([options.signal, deadline.signal]) : deadline.signal;

  let response: Response;
  try {
    // Retried only while the request has not reached the server. Once it has,
    // trying again would ask the same question twice — see `services/retry`.
    response = await withBackoff(
      () =>
        apiFetch('/api/v1/query', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            ...(options.sessionId ? { 'x-session-id': options.sessionId } : {}),
          },
          body: JSON.stringify({
            text: question,
            jurisdiction: options.jurisdiction,
            channel: options.channel ?? 'text',
            product_class: options.productClass ?? 'undetermined',
            language_out: options.languageOut ?? null,
            session_id: options.sessionId ?? 'anonymous',
          }),
          signal,
        }),
      { signal },
    );
  } catch (error) {
    if (deadline.signal.aborted) {
      throw new QueryError('timeout', 'The search took too long.');
    }
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    if (isOffline()) throw new QueryError('offline', 'This device is not connected.');
    throw new QueryError('unreachable', 'The service could not be reached.');
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    // The failure came back before the stream started, so it is a status and a
    // body rather than an event.
    const body = (await response.json().catch(() => null)) as { code?: string } | null;
    throw new QueryError(toErrorCode(body?.code ?? ''), `Request failed (${response.status}).`);
  }
  if (!response.body) throw new QueryError('unreachable', 'The response carried no body.');

  let result: QueryResult | null = null;

  for await (const line of lines(response.body)) {
    let message: Message;
    try {
      message = JSON.parse(line) as Message;
    } catch {
      // A line that is not JSON means the stream is not what it claims to be.
      // Better to fail than to answer from half of it.
      throw new QueryError('unknown', 'The response could not be read.');
    }

    switch (message.event) {
      case 'stage':
        options.onStage?.({ id: message.id, ms: message.ms });
        break;
      case 'retrieved':
        options.onRetrieved?.({ passages: message.passages, documents: message.documents });
        break;
      case 'error':
        throw new QueryError(toErrorCode(message.code), message.message);
      case 'result':
        if (result === null || message.jurisdiction === options.jurisdiction) {
          result = { ...message } as QueryResult;
          delete (result as Partial<ResultMessage>).event;
        }
        break;
    }
  }

  if (result === null) throw new QueryError('unknown', 'The stream ended without an answer.');
  return result;
}
