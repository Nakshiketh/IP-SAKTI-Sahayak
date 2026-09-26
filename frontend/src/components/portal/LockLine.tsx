import { Lock } from 'lucide-react';
import { useTranslation } from 'react-i18next';

/** The one standing reassurance, at the foot of every portal step. */
export function LockLine() {
  const { t } = useTranslation('common');
  return (
    <p className="mt-auto flex gap-2 pt-10 text-[14px] leading-[1.5] text-white/[0.78]">
      <Lock size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
      {t('auth.portal.lock')}
    </p>
  );
}
