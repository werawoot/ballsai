'use client'

import { useTranslations } from 'next-intl'

// Under the code boxes: where a missing email usually is, and Google as the way out, so a
// person whose code has not arrived is never stuck on this step.
export function OtpHelp({ onUseGoogle }: { onUseGoogle: () => void }) {
  const t = useTranslations('loginOtp')
  return (
    <div className="lg-help">
      <p><b>{t('noEmailTitle')}</b> {t('noEmailBody')}</p>
      <button className="lg-resend" onClick={onUseGoogle} type="button">{t('useGoogle')}</button>
    </div>
  )
}
