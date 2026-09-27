import { cookies } from 'next/headers'
import { getRequestConfig } from 'next-intl/server'
import { DEFAULT_LOCALE, LOCALE_COOKIE, resolveLocale, withFallback } from './config'
import th from '@/messages/th.json'
import en from '@/messages/en.json'

// Read once per request by next-intl (wired in next.config.js). Reading the cookie makes
// every route render per request; see ADR-009 for why that is accepted for now.
export default getRequestConfig(async () => {
  const locale = resolveLocale(cookies().get(LOCALE_COOKIE)?.value)
  return {
    locale,
    messages: locale === DEFAULT_LOCALE ? th : withFallback(en, th),
    timeZone: 'Asia/Bangkok',
  }
})
