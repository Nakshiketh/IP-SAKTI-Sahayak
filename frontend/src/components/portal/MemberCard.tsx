import { useTranslation } from 'react-i18next';

import type { DemoCard } from '@/services/demoCard';

/**
 * The member card as a physical object: CR80, 85.6 x 54 mm.
 *
 * Every size inside is in `cqw`, a share of the card's own width, so the card
 * is the same object at any size: set its width to 85.6 mm (the print styles
 * in `styles/portal.css` do) and it prints at true size, with the QR image at
 * 34% of the width, which makes the code itself over 22 mm.
 *
 * Leaf green, a little bolder than the page, because a card is held rather
 * than read on a screen. No photograph and no placeholder for one; no emblem.
 * `lib/cardImage.ts` draws the same layout onto a canvas for the PNG.
 */
export function MemberCard({ card, qrUrl }: { card: DemoCard; qrUrl: string }) {
  const { t } = useTranslation('common');
  return (
    <div className="demo-card [container-type:inline-size] [&_p]:max-w-none">
      <article
        aria-label={t('auth.card.label', { name: card.name })}
        className="relative flex aspect-[85.6/54] w-full flex-col overflow-hidden rounded-[3.7cqw]
          bg-[#1D4B36] text-white [print-color-adjust:exact]"
      >
        <div className="flex flex-1 gap-[4cqw] px-[5.5cqw] pt-[5cqw]">
          <div className="flex min-w-0 flex-1 flex-col">
            <p className="font-display text-[5.6cqw] font-bold leading-none">{t('brand.name')}</p>
            <p lang="hi" className="mt-[1cqw] font-display text-[3cqw] leading-none text-white/85">
              {t('auth.portal.wordmarkHindi')}
            </p>

            <div className="mt-auto pb-[3cqw]">
              <p className="text-[6cqw] font-semibold leading-tight">{card.name}</p>
              <p className="mt-[0.6cqw] text-[3.2cqw] leading-snug text-white/90">{card.role}</p>
              <p className="text-[3.2cqw] leading-snug text-white/90">{card.institution}</p>
              <dl className="mt-[2.4cqw] grid grid-cols-[auto_1fr] gap-x-[2.4cqw] text-[2.9cqw]">
                <dt className="text-white/75">{t('auth.code.memberId')}</dt>
                <dd className="font-semibold tabular-nums">{card.memberId}</dd>
                <dt className="text-white/75">{t('auth.card.issued')}</dt>
                <dd className="tabular-nums">{card.issuedOn}</dd>
              </dl>
            </div>
          </div>

          <div className="shrink-0 self-center rounded-[1.4cqw] bg-white p-[1.2cqw]">
            {/* The QR is decorative to a screen reader: the Member ID beside
                it says who the card belongs to, and the code is for a camera. */}
            <img
              src={qrUrl}
              alt=""
              width={344}
              height={344}
              className="block h-[34cqw] w-[34cqw] [image-rendering:pixelated]"
            />
          </div>
        </div>

        <p className="bg-[#163A2A] px-[5.5cqw] py-[2cqw] text-[2.7cqw] leading-none text-white/90">
          {t('auth.card.scanAt')}
        </p>
      </article>
    </div>
  );
}
