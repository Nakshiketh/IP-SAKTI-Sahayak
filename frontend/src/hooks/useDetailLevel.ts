import { useCallback, useEffect, useState } from 'react';

/**
 * How much of an answer to show, remembered between visits.
 *
 * Two levels, not a slider. Simple is the answer, what it means, and how much
 * expert review it needs; Expert opens the matrices, the provenance and the
 * receipt without being asked twice. Someone who wants the evidence wants it
 * every time, and making them expand four sections on every answer is a way of
 * hiding it from the people most likely to check the product's work.
 *
 * Stored in localStorage because it is a reading preference and nothing else —
 * no question, no answer, nothing about the person. It survives a private
 * window refusing storage: the default is simply used, and nothing throws.
 */

export type DetailLevel = 'simple' | 'expert';

const KEY = 'sahayak.detailLevel';

function read(): DetailLevel {
  try {
    return localStorage.getItem(KEY) === 'expert' ? 'expert' : 'simple';
  } catch {
    // Storage refused. A reading preference is not worth an error path.
    return 'simple';
  }
}

export function useDetailLevel(): [DetailLevel, (level: DetailLevel) => void] {
  const [level, setLevel] = useState<DetailLevel>('simple');

  // Read after mount rather than during render: the first paint has to match
  // what the server-less build would produce, and touching storage in a render
  // makes the component impure.
  useEffect(() => {
    setLevel(read());
  }, []);

  const choose = useCallback((next: DetailLevel) => {
    setLevel(next);
    try {
      localStorage.setItem(KEY, next);
    } catch {
      // The choice still applies to this session.
    }
  }, []);

  return [level, choose];
}
