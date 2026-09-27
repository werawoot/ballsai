'use client'

import { useLocale, useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { useTransition } from 'react'
import { localeCookie, otherLocale } from '@/i18n/config'

// One button that offers the language not showing: "EN" on a Thai page, "ไทย" on an
// English one. A single 44px target fits a 320px header beside a page's own action,
// where a two-button "ไทย | EN" switch would push that action's label into an ellipsis.
// Its name is written in the language it switches to, so the person who needs it can
// read it.
export default function LanguageSwitch() {
  const locale = useLocale()
  const t = useTranslations('language')
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const target = otherLocale(locale)

  return <button
    type="button"
    className="bds-lang-switch"
    lang={target}
    aria-label={t('switchLabel')}
    aria-busy={pending}
    disabled={pending}
    onClick={() => {
      document.cookie = localeCookie(target, window.location.protocol === 'https:')
      // Re-render the server components in the new language; the URL stays the same.
      startTransition(() => router.refresh())
    }}
  >{t('switchShort')}</button>
}
