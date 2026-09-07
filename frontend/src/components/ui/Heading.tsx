import type { ReactNode } from 'react';

/**
 * A heading whose level is set by where it sits, not by what it looks like.
 *
 * A component that hardcodes `h4` produces a broken outline the moment it is
 * used one level up or down. Size comes from a class; level comes from the
 * document.
 */
export type HeadingLevel = 2 | 3 | 4 | 5 | 6;

export function Heading({
  level,
  className,
  children,
}: {
  level: HeadingLevel;
  className?: string;
  children: ReactNode;
}) {
  const Tag = `h${level}` as const;
  return <Tag className={className}>{children}</Tag>;
}
