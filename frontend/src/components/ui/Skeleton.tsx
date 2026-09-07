import { cn } from '@/lib/cn';

/**
 * The waiting state: a blank ruled leaf.
 *
 * Deliberately not a shimmer. A gradient sweeping across the page is decoration,
 * and it implies progress the system cannot actually report. This breathes on
 * opacity alone, and stops entirely under prefers-reduced-motion.
 */
interface SkeletonProps {
  /** Number of ruled lines to show. */
  lines?: number;
  className?: string;
}

export function Skeleton({ lines = 3, className }: SkeletonProps) {
  return (
    <div className={cn('space-y-3', className)} aria-hidden="true">
      {Array.from({ length: lines }, (_, i) => (
        <div
          key={i}
          className="leaf-line"
          style={{ width: i === lines - 1 ? '62%' : '100%', animationDelay: `${i * 120}ms` }}
        />
      ))}
    </div>
  );
}

export function SkeletonBlock({ className }: { className?: string }) {
  return <div className={cn('leaf-block rounded-data', className)} aria-hidden="true" />;
}
