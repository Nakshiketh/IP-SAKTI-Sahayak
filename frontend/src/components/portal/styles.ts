import { cn } from '@/lib/cn';
import { PASSWORD_RULES } from '@/lib/authCopy';

/**
 * The portal's button and link faces, and the strength measure, apart from the
 * components so React Fast Refresh can hot-swap those.
 *
 * The primary button is herbarium white with ink text (15:1); the secondary is
 * an outline. Neither lifts or glows on hover: the face changes colour, which
 * is all a hover has to say. Both are 48 px tall on narrow screens, 44 px from
 * `sm` up.
 */

export const primaryButton = cn(
  'inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-[6px] bg-[#F6F7F3] px-4',
  'text-[16px] font-medium text-[#1A2029] transition-colors duration-150 hover:bg-white',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2',
  'focus-visible:ring-offset-[#08130D] disabled:cursor-not-allowed disabled:opacity-60 sm:min-h-11',
);

export const secondaryButton = cn(
  'inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-[6px] border border-white/[0.45]',
  'px-4 text-[16px] font-medium text-white transition-colors duration-150 hover:bg-white/10',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white disabled:opacity-60 sm:min-h-11',
);

export const textLink = cn(
  'rounded-[2px] text-[14px] text-white underline decoration-white/50 underline-offset-4',
  'hover:decoration-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white',
);

/** How strong a new password is, on four segments: Weak, Fair or Strong. */
export function strengthOf(password: string): { score: number; label: 'weak' | 'fair' | 'strong' } {
  // One segment per rule met. Meeting all four is Fair; Strong also needs
  // 12 or more characters, or a symbol.
  const met = PASSWORD_RULES.filter((rule) => rule.test(password)).length;
  const extra = password.length >= 12 || /[^A-Za-z0-9]/.test(password);
  const score = met === 4 ? (extra ? 4 : 3) : Math.min(met, 2);
  return { score, label: score <= 2 ? 'weak' : score === 3 ? 'fair' : 'strong' };
}
