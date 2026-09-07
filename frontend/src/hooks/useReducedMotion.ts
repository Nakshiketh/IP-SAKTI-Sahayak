import { useEffect, useState } from 'react';

/**
 * Whether the reader has asked for reduced motion.
 *
 * The stylesheet already neutralises animation durations. This hook is for the
 * cases CSS cannot reach: skipping an orchestrated sequence entirely rather than
 * running it at 0.01ms.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false,
  );

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = (event: MediaQueryListEvent) => setReduced(event.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  return reduced;
}
