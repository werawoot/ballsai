// The two languages the site speaks, and how a request picks one.
//
// The choice lives in a cookie, not the URL: links already shared -- a player's public
// profile, a tournament -- keep working unchanged, and athlete pages, which belong to
// minors, gain no second indexable copy. See docs/decisions/ADR-009-internationalization.md.
//
// Kept free of Next and React so every rule here can be tested directly.

export const LOCALES = ['th', 'en'] as const
export type Locale = (typeof LOCALES)[number]

/** Most users are Thai; a first visit, and anything unrecognised, is Thai. */
export const DEFAULT_LOCALE: Locale = 'th'

/** The cookie name next-intl itself uses, so a later move to its routing reads the same value. */
export const LOCALE_COOKIE = 'NEXT_LOCALE'

/** A year: a language choice should survive until the person changes it. */
export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value)
}

export function resolveLocale(value: string | null | undefined): Locale {
  return isLocale(value) ? value : DEFAULT_LOCALE
}

/** The language the switch offers: always the one not showing. */
export function otherLocale(locale: Locale): Locale {
  return locale === 'th' ? 'en' : 'th'
}

/** The Set-Cookie value the switch writes. `Secure` wherever the page itself is https. */
export function localeCookie(locale: Locale, secure: boolean): string {
  return `${LOCALE_COOKIE}=${locale}; Path=/; Max-Age=${LOCALE_COOKIE_MAX_AGE}; SameSite=Lax${secure ? '; Secure' : ''}`
}

type Messages = { [key: string]: string | Messages }

/**
 * English laid over Thai, key by key. A string not yet translated shows in Thai rather
 * than as a raw key or a blank, so a page can go out half-translated without breaking.
 */
export function withFallback(primary: Messages, fallback: Messages): Messages {
  const merged: Messages = { ...fallback }
  for (const [key, value] of Object.entries(primary)) {
    const base = fallback[key]
    merged[key] = typeof value === 'object' && typeof base === 'object' ? withFallback(value, base) : value
  }
  return merged
}
