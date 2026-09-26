import { useTranslation } from 'react-i18next';

import type { MemberCard } from '@/services/auth';

/**
 * The member, as a herbarium accession label.
 *
 * The one memorable moment in the portal: when a card verifies, this slip of
 * paper replaces the scanner. Label and value rows, a thin border, a 2 px
 * radius, and beside it a circular "Verified" seal in neem that presses in
 * once (`portal-press`, removed under reduced motion). It is the only light
 * surface on the page, which is what makes it land.
 */
export function MemberRecord({ member }: { member: MemberCard }) {
  const { t } = useTranslation('common');
  const rows: Array<[string, string]> = [
    [t('auth.code.name'), member.name],
    [t('auth.code.role'), member.role],
    [t('auth.code.institution'), member.institution],
    [t('auth.code.memberId'), member.memberId],
  ];

  return (
    // On a phone the seal sits above the rows, so the values get the full
    // width; from `sm` up it stands beside them, as on a pressed label.
    <div
      className="flex flex-col-reverse gap-3 rounded-[2px] border border-[#D5DAD0] bg-[#F6F7F3]
        p-4 text-[#1A2029] sm:flex-row sm:items-start sm:gap-4"
    >
      <dl className="min-w-0 flex-1 text-[14px]">
        {rows.map(([label, value], index) => (
          <div
            key={label}
            className={
              index === 0
                ? 'grid grid-cols-[6rem_1fr] gap-2 pb-1.5'
                : 'grid grid-cols-[6rem_1fr] gap-2 border-t border-[#D5DAD0] py-1.5'
            }
          >
            <dt className="text-[#4F5866]">{label}</dt>
            <dd
              className={index === 3 ? 'whitespace-nowrap font-medium tabular-nums' : 'font-medium'}
            >
              {value}
            </dd>
          </div>
        ))}
      </dl>
      <div
        aria-hidden="true"
        className="portal-press grid h-16 w-16 shrink-0 place-items-center self-end rounded-full
          border-2 border-[#2F6B45] p-[3px] sm:h-[4.5rem] sm:w-[4.5rem] sm:self-auto"
      >
        <span
          className="grid h-full w-full place-items-center rounded-full border border-[#2F6B45]
            text-center text-[12px] font-semibold leading-tight text-[#2F6B45]"
        >
          {t('auth.portal.seal')}
        </span>
      </div>
    </div>
  );
}
