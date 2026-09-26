import { Download, Printer } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { MemberCard } from '@/components/portal/MemberCard';
import { useDocumentMeta } from '@/hooks/useDocumentMeta';
import { drawCard } from '@/lib/cardImage';
import NotFound from '@/routes/NotFound';
import { CARD_QR_URL, fetchDemoCard, type DemoCardResult } from '@/services/demoCard';

/**
 * The demo member card, to print or save.
 *
 * Reachable before sign-in, because the card is what a member signs in with.
 * It exists only when the API says so (ENABLE_DEMO_CARD, not production);
 * otherwise this is the ordinary "not found" page. It shows the image
 * `issue-card` wrote and never makes one.
 *
 * Printing hides everything but the card and sets it at 85.6 x 54 mm
 * (`styles/portal.css`). The PNG is the same card at 300 dpi.
 */
export default function DemoCard() {
  const { t } = useTranslation('common');
  useDocumentMeta(t('auth.card.title'), t('auth.card.body'));
  const [result, setResult] = useState<DemoCardResult | null>(null);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void fetchDemoCard(controller.signal).then(setResult);
    return () => controller.abort();
  }, []);

  if (result === null) return null;
  if (result.state === 'absent') return <NotFound />;

  async function download(card: Extract<DemoCardResult, { state: 'ready' }>['card']) {
    setSaving(true);
    setProblem(null);
    try {
      const blob = await drawCard(
        card,
        {
          brand: t('brand.name'),
          brandHindi: t('auth.portal.wordmarkHindi'),
          memberIdLabel: t('auth.code.memberId'),
          issuedLabel: t('auth.card.issued'),
          scanAt: t('auth.card.scanAt'),
        },
        CARD_QR_URL,
      );
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${card.memberId}-member-card.png`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      setProblem(t('auth.card.downloadFailed'));
    } finally {
      setSaving(false);
    }
  }

  const button =
    'inline-flex min-h-11 items-center justify-center gap-2 rounded-[6px] px-4 text-[16px] ' +
    'font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 ' +
    'focus-visible:ring-[#1D4B36] focus-visible:ring-offset-2 disabled:opacity-60';

  return (
    <main className="demo-card-page min-h-[100svh] bg-[#F6F7F3] px-5 py-10 text-[#1A2029] sm:px-8">
      <div className="mx-auto max-w-[36rem]">
        <h1 className="font-display text-[28px] font-semibold leading-tight sm:text-[36px]">
          {t('auth.card.title')}
        </h1>
        <p className="mt-2 text-[16px] text-[#4F5866]">{t('auth.card.body')}</p>

        {result.state === 'unavailable' ? (
          <p
            role="alert"
            className="mt-6 rounded-[6px] border border-[#B42318]/40 bg-[#B42318]/[0.06] px-3 py-2 text-[14px] text-[#8A1C12]"
          >
            {result.message || t('auth.card.unavailable')}
          </p>
        ) : (
          <>
            <div className="mt-8">
              <MemberCard card={result.card} qrUrl={CARD_QR_URL} />
            </div>

            <div className="mt-6 flex flex-wrap gap-3 print:hidden">
              <button
                type="button"
                onClick={() => void download(result.card)}
                disabled={saving}
                className={`${button} bg-[#1D4B36] text-white hover:bg-[#163A2A]`}
              >
                <Download size={18} aria-hidden="true" />
                {t('auth.card.download')}
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className={`${button} border border-[#1D4B36] text-[#1D4B36] hover:bg-[#1D4B36]/[0.06]`}
              >
                <Printer size={18} aria-hidden="true" />
                {t('auth.card.print')}
              </button>
            </div>
            {problem ? (
              <p role="alert" className="mt-3 text-[14px] text-[#8A1C12]">
                {problem}
              </p>
            ) : null}
            <p className="mt-6 text-[14px] text-[#4F5866] print:hidden">
              {t('auth.card.printNote')}
            </p>
          </>
        )}

        <p className="mt-8 print:hidden">
          <Link
            to="/login"
            className="rounded-[2px] text-[14px] text-[#1D4B36] underline underline-offset-4
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1D4B36]"
          >
            {t('auth.card.toPortal')}
          </Link>
        </p>
      </div>
    </main>
  );
}
