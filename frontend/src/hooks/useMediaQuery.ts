import { useEffect, useState } from 'react';

/**
 * Track a media query in JavaScript.
 *
 * Used only where the *behaviour* differs by width, not the styling: sources
 * appear in a drawer at tablet width and a bottom sheet on a phone, and those
 * are different components rather than one component styled two ways. Anything
 * that is purely visual stays in CSS.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia(query).matches
      : false,
  );

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const list = window.matchMedia(query);
    setMatches(list.matches);
    const onChange = (event: MediaQueryListEvent) => setMatches(event.matches);
    list.addEventListener('change', onChange);
    return () => list.removeEventListener('change', onChange);
  }, [query]);

  return matches;
}

/** The two widths the workspace changes behaviour at. */
export const DESKTOP_QUERY = '(min-width: 1280px)';
export const TABLET_QUERY = '(min-width: 768px)';
