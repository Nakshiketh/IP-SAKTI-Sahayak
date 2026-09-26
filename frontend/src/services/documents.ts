import { apiFetch } from '@/lib/http';

/**
 * Sending a file to be read, and nothing more.
 *
 * The server does the validating. This deliberately does not pre-check the size
 * or the type beyond the `accept` attribute on the input: a check here is a
 * convenience for an honest user and no obstacle at all to anyone else, and two
 * implementations of the same rule drift. The server's refusal messages are
 * written to be shown, so they are shown.
 */
export interface ReadDocument {
  filename: string;
  kind: string;
  characters: number;
  pages: number | null;
  truncated: boolean;
  text: string;
  stated_facts: string[];
  missing_facts: string[];
  /** Composed by the server so it cannot be edited away on this side. */
  label: string;
}

export type ReadResult =
  { ok: true; document: ReadDocument } | { ok: false; code: string; message: string };

export async function readDocument(file: File): Promise<ReadResult> {
  const body = new FormData();
  body.append('file', file);

  let response: Response;
  try {
    response = await apiFetch('/api/v1/documents/read', {
      method: 'POST',
      body,
    });
  } catch {
    return { ok: false, code: 'unreachable', message: 'Could not reach the server.' };
  }

  if (response.ok) {
    try {
      return { ok: true, document: (await response.json()) as ReadDocument };
    } catch {
      return { ok: false, code: 'unreadable', message: 'The server sent something unreadable.' };
    }
  }

  // FastAPI puts our {code, message} under `detail`. A plain-string detail
  // means something else refused — the middleware, a proxy — so it is shown as
  // it came rather than being dressed up as one of our codes.
  let detail: unknown;
  try {
    detail = ((await response.json()) as { detail?: unknown }).detail;
  } catch {
    detail = undefined;
  }

  if (detail && typeof detail === 'object' && 'message' in detail) {
    const named = detail as { code?: string; message?: string };
    return {
      ok: false,
      code: named.code ?? 'rejected',
      message: named.message ?? 'That file could not be read.',
    };
  }

  if (response.status === 413) {
    return { ok: false, code: 'too_large', message: 'That file is too large to read here.' };
  }
  return {
    ok: false,
    code: 'rejected',
    message: typeof detail === 'string' ? detail : 'That file could not be read.',
  };
}
