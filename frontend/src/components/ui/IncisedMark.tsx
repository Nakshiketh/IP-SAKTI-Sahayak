/**
 * The category mark: intellectual property, or regulation.
 *
 * The two differ in shape, not only in colour — three incised strokes for the
 * body of rights, a registry stamp for the body of rules. A reader who cannot
 * separate the hues still separates the categories.
 */
export type IncisedKind = 'ip' | 'regulatory';

interface IncisedMarkProps {
  kind: IncisedKind;
  /** Accessible name. Pass null when an adjacent heading already says it. */
  label?: string | null;
  className?: string;
}

export function IncisedMark({ kind, label = null, className }: IncisedMarkProps) {
  const hidden = label === null;
  return (
    <svg
      viewBox="0 0 20 20"
      width="20"
      height="20"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.25"
      strokeLinecap="square"
      aria-hidden={hidden || undefined}
      role={hidden ? undefined : 'img'}
      aria-label={hidden ? undefined : (label ?? undefined)}
    >
      {kind === 'ip' ? (
        <>
          {/* Incised strokes, as text ruled into a leaf. */}
          <path d="M3 5.5h14M3 10h10M3 14.5h12" />
          <path d="M2 3.5v13" strokeWidth="1.75" />
        </>
      ) : (
        <>
          {/* A registry stamp: a struck square. */}
          <rect x="3" y="3" width="14" height="14" />
          <path d="M3 10h14" />
        </>
      )}
    </svg>
  );
}
