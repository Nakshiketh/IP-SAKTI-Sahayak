/**
 * The API client.
 *
 * What matters here is not that a happy path parses — it is that a stream which
 * goes wrong halfway is reported as a failure rather than as an answer built
 * from the half that arrived. Every test below is a way that could happen.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

import { QueryError } from '@/services/query';
import { runHttpQuery } from '@/services/query.http';

function streamOf(lines: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const line of lines) controller.enqueue(encoder.encode(line));
      controller.close();
    },
  });
}

function respond(lines: string[], init: ResponseInit = {}) {
  const response = new Response(streamOf(lines), { status: 200, ...init });
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));
}

const RESULT = {
  event: 'result',
  queryId: 'q1',
  question: 'anything',
  jurisdiction: 'IN',
  evidence: {
    jurisdiction: 'IN',
    passages: [],
    contradictions: [],
    out_of_scope: false,
    needs_more_facts: false,
  },
  confidence: { level: 'moderate', reasonKey: 'moderateThin', reasonVars: {}, abstainReason: null },
  answer: null,
  relatedRecords: [],
  followUps: [],
  stages: [],
  totalMs: 12,
  documentsSearched: 2,
  sources: {},
  passages: {},
  language: { language: 'en', confidence: 1, ambiguousWith: [], decided: true },
  route: { jurisdiction: 'IN', inferred: false, marker: null },
  corpusVersion: '0.0.0-demo',
  isDemo: true,
  translation: { engine: 'passthrough', translated: false },
  refusal: null,
};

afterEach(() => vi.unstubAllGlobals());

describe('reading the stream', () => {
  it('reports each stage as it finishes, before the result', async () => {
    respond([
      JSON.stringify({ event: 'stage', id: 'detect', ms: 1 }) + '\n',
      JSON.stringify({ event: 'retrieved', passages: 3, documents: 2 }) + '\n',
      JSON.stringify(RESULT) + '\n',
    ]);

    const seen: string[] = [];
    let found: { passages: number; documents: number } | null = null;
    const result = await runHttpQuery('anything', {
      jurisdiction: 'IN',
      onStage: (stage) => seen.push(stage.id),
      onRetrieved: (count) => (found = count),
    });

    expect(seen).toEqual(['detect']);
    expect(found).toEqual({ passages: 3, documents: 2 });
    expect(result.queryId).toBe('q1');
  });

  it('reassembles an event split across chunk boundaries', async () => {
    const line = JSON.stringify(RESULT) + '\n';
    respond([line.slice(0, 40), line.slice(40, 120), line.slice(120)]);
    const result = await runHttpQuery('anything', { jurisdiction: 'IN' });
    expect(result.corpusVersion).toBe('0.0.0-demo');
  });

  it('keeps the result for the jurisdiction that was asked for', async () => {
    respond([
      JSON.stringify({ ...RESULT, jurisdiction: 'INTL', queryId: 'other' }) + '\n',
      JSON.stringify({ ...RESULT, jurisdiction: 'IN', queryId: 'wanted' }) + '\n',
    ]);
    const result = await runHttpQuery('anything', { jurisdiction: 'IN' });
    expect(result.queryId).toBe('wanted');
  });
});

describe('failing rather than answering from half a stream', () => {
  it('raises when the stream ends without a result', async () => {
    respond([JSON.stringify({ event: 'stage', id: 'detect', ms: 1 }) + '\n']);
    await expect(runHttpQuery('anything', { jurisdiction: 'IN' })).rejects.toMatchObject({
      code: 'unknown',
    });
  });

  it('raises on an error event that arrives mid-stream', async () => {
    respond([
      JSON.stringify({ event: 'stage', id: 'detect', ms: 1 }) + '\n',
      JSON.stringify({
        event: 'error',
        code: 'generation_unavailable',
        message: 'no model configured',
      }) + '\n',
    ]);
    await expect(runHttpQuery('anything', { jurisdiction: 'IN' })).rejects.toMatchObject({
      code: 'generation_unavailable',
    });
  });

  it('raises rather than parsing a line that is not JSON', async () => {
    respond(['<html>a proxy error page</html>\n']);
    await expect(runHttpQuery('anything', { jurisdiction: 'IN' })).rejects.toBeInstanceOf(
      QueryError,
    );
  });

  it('reads the code off a failure that came before the stream started', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ code: 'rate_limited', message: 'slow down' }), {
          status: 429,
        }),
      ),
    );
    await expect(runHttpQuery('anything', { jurisdiction: 'IN' })).rejects.toMatchObject({
      code: 'rate_limited',
    });
  });

  it('reports an unreachable service as unreachable, not as an empty answer', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await expect(runHttpQuery('anything', { jurisdiction: 'IN' })).rejects.toMatchObject({
      code: 'unreachable',
    });
  });

  it('lets an abort through untouched, so a cancelled question is not a failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new DOMException('aborted', 'AbortError')));
    await expect(runHttpQuery('anything', { jurisdiction: 'IN' })).rejects.toBeInstanceOf(
      DOMException,
    );
  });
});

describe('what is sent', () => {
  it('carries the question, the jurisdiction and the session, and nothing else', async () => {
    respond([JSON.stringify(RESULT) + '\n']);
    await runHttpQuery('a question', {
      jurisdiction: 'IN',
      productClass: 'phytopharmaceutical',
      sessionId: 's-1',
    });

    const call = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const [url, init] = call as [string, RequestInit];
    expect(url).toBe('/api/v1/query');
    expect((init.headers as Record<string, string>)['x-session-id']).toBe('s-1');
    expect(JSON.parse(init.body as string)).toEqual({
      text: 'a question',
      jurisdiction: 'IN',
      product_class: 'phytopharmaceutical',
      language_out: null,
      session_id: 's-1',
    });
  });
});
