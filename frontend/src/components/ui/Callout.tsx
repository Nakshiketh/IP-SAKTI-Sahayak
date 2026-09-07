import { CircleSlash, Info, TriangleAlert } from 'lucide-react';

import { cn } from '@/lib/cn';
import { Heading, type HeadingLevel } from './Heading';

/**
 * Three tones, three jobs.
 *
 *   info     something worth knowing alongside the content.
 *   caution  something that could go wrong. --lac.
 *   abstain  the system declining to answer. --lac, heavier, and never dressed up
 *            to look like an answer.
 *
 * The icon sits inline with the heading. There is no coloured rounded square
 * above a title anywhere in this system.
 */
export type CalloutTone = 'info' | 'caution' | 'abstain';

interface CalloutProps {
  tone: CalloutTone;
  title: string;
  children?: React.ReactNode;
  /** Set from where the callout sits in the document outline. */
  titleLevel?: HeadingLevel;
  className?: string;
}

const TONES: Record<CalloutTone, { box: string; mark: string; Icon: typeof Info }> = {
  info: { box: 'border-stamp/40 bg-stamp/[0.05]', mark: 'text-stamp', Icon: Info },
  caution: { box: 'border-lac/40 bg-lac/[0.05]', mark: 'text-lac', Icon: TriangleAlert },
  abstain: { box: 'border-lac bg-lac/[0.07]', mark: 'text-lac', Icon: CircleSlash },
};

export function Callout({ tone, title, children, titleLevel = 3, className }: CalloutProps) {
  const { box, mark, Icon } = TONES[tone];
  return (
    <div
      className={cn('rounded-control border p-3', box, className)}
      role={tone === 'info' ? undefined : 'note'}
    >
      <Heading level={titleLevel} className={cn('flex items-center gap-2 text-base', mark)}>
        <Icon size={16} aria-hidden="true" className="shrink-0" />
        {title}
      </Heading>
      {children ? <div className="mt-1.5 text-base">{children}</div> : null}
    </div>
  );
}
