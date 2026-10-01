import { readdirSync, readFileSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createTranslator } from 'next-intl'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_LOCALE,
  LOCALES,
  LOCALE_COOKIE,
  isLocale,
  type Locale,
  localeCookie,
  otherLocale,
  resolveLocale,
  withFallback,
} from '@/i18n/config'
import { NAV_ITEMS } from '@/lib/site-nav'
import th from '@/messages/th.json'
import en from '@/messages/en.json'

const root = fileURLToPath(new URL('../', import.meta.url))
const read = (path: string) => readFileSync(`${root}${path}`, 'utf8')
const walk = (dir: string): string[] =>
  readdirSync(`${root}${dir}`).flatMap(entry => {
    const path = `${dir}/${entry}`
    if (statSync(`${root}${path}`).isDirectory()) return walk(path)
    return /\.tsx?$/.test(path) ? [path] : []
  })

type Tree = { [key: string]: string | Tree }
const flatten = (tree: Tree, prefix = ''): Record<string, string> =>
  Object.fromEntries(Object.entries(tree).flatMap(([key, value]) =>
    typeof value === 'string' ? [[`${prefix}${key}`, value]] : Object.entries(flatten(value, `${prefix}${key}.`))))
const MESSAGES: Record<string, Tree> = { th, en }
const placeholders = (message: string) => [...message.matchAll(/\{(\w+)/g)].map(match => match[1]).sort()

describe('which language a request gets', () => {
  it('speaks Thai and English, Thai first', () => {
    expect(LOCALES).toEqual(['th', 'en'])
    expect(DEFAULT_LOCALE).toBe('th')
  })

  it('falls back to Thai for a missing, empty or unknown cookie', () => {
    for (const value of [undefined, null, '', 'EN', 'en-US', 'fr', ' en']) {
      expect(resolveLocale(value)).toBe('th')
    }
    expect(resolveLocale('en')).toBe('en')
    expect(resolveLocale('th')).toBe('th')
    expect(isLocale('en')).toBe(true)
    expect(isLocale(42)).toBe(false)
  })

  it('offers the language not showing', () => {
    expect(otherLocale('th')).toBe('en')
    expect(otherLocale('en')).toBe('th')
  })

  it('remembers the choice for a year, site-wide, Secure on https', () => {
    expect(localeCookie('en', true)).toBe(`${LOCALE_COOKIE}=en; Path=/; Max-Age=31536000; SameSite=Lax; Secure`)
    expect(localeCookie('th', false)).toBe(`${LOCALE_COOKIE}=th; Path=/; Max-Age=31536000; SameSite=Lax`)
  })

  it('shows Thai, not a raw key, for anything English has not translated yet', () => {
    const merged = withFallback({ a: { b: 'B' } }, { a: { b: 'ข', c: 'ค' }, d: 'ง' })
    expect(merged).toEqual({ a: { b: 'B', c: 'ค' }, d: 'ง' })
  })

  it('is read from that cookie, once per request, with the fallback applied', () => {
    const request = read('i18n/request.ts')
    expect(request).toContain('resolveLocale((await cookies()).get(LOCALE_COOKIE)?.value)')
    expect(request).toContain('withFallback(en, th)')
    expect(read('next.config.js')).toContain("createNextIntlPlugin('./i18n/request.ts')")
    const layout = read('app/layout.tsx')
    expect(layout).toContain('<html lang={locale}>')
    expect(layout).toMatch(/<NextIntlClientProvider>[\s\S]*<SiteNav \/>[\s\S]*<\/NextIntlClientProvider>/)
  })
})

describe('the two message files', () => {
  const thai = flatten(th)
  const english = flatten(en)

  it('have exactly the same keys, so neither language can silently lose a string', () => {
    expect(Object.keys(english).sort()).toEqual(Object.keys(thai).sort())
  })

  it('never ship an empty string', () => {
    for (const [locale, tree] of Object.entries(MESSAGES)) {
      for (const [key, value] of Object.entries(flatten(tree))) {
        expect(value.trim(), `${locale}: ${key}`).not.toBe('')
      }
    }
  })

  it('use the same placeholders in both languages', () => {
    for (const key of Object.keys(thai)) {
      expect(placeholders(english[key]), key).toEqual(placeholders(thai[key]))
    }
  })

  it('all format with the real runtime, in both languages', () => {
    for (const [locale, messages] of Object.entries(MESSAGES)) {
      const errors: string[] = []
      const t = createTranslator({ locale: locale as Locale, messages, onError: error => errors.push(error.message) }) as unknown as
        (key: string, values?: Record<string, string | number>) => string
      for (const key of Object.keys(flatten(messages))) {
        const values = Object.fromEntries(placeholders(flatten(messages)[key]).map(name => [name, name === 'count' ? 3 : 'X']))
        expect(t(key, values), `${locale}: ${key}`).not.toBe(key)
      }
      expect(errors).toEqual([])
    }
  })

  it('name every tab of the bottom bar, and every cover status and sport', () => {
    for (const item of NAV_ITEMS) expect(thai[`nav.items.${item.id}`], item.id).toBeTruthy()
    for (const status of ['open', 'closed']) expect(thai[`tournamentCover.status.${status}`]).toBeTruthy()
    for (const sport of ['football', 'futsal']) expect(thai[`tournamentCover.sport.${sport}`]).toBeTruthy()
  })

  it('name the switch in the language it switches to', () => {
    expect(thai['language.switchShort']).toBe('EN')
    expect(english['language.switchShort']).toBe('ไทย')
    expect(thai['language.switchLabel']).toMatch(/English/)
    expect(english['language.switchLabel']).toMatch(/ภาษาไทย/)
  })
})

describe('the language switch', () => {
  const component = read('components/LanguageSwitch.tsx')
  const css = read('app/globals.css')

  it('is on every page that uses the shared header', () => {
    expect(read('components/PageHeader.tsx')).toContain('<LanguageSwitch />')
  })

  it('stores the choice with the shared cookie rule and re-renders in place', () => {
    expect(component).toContain("localeCookie(target, window.location.protocol === 'https:')")
    expect(component).toContain('router.refresh()')
    expect(component).toContain('const target = otherLocale(locale)')
  })

  it('marks its own text with the language it is written in', () => {
    expect(component).toContain('lang={target}')
    expect(component).toContain("aria-label={t('switchLabel')}")
  })

  it('is at least a 44px target and never shrinks', () => {
    const start = css.indexOf('.bds-lang-switch {')
    const rule = css.slice(start, css.indexOf('}', start))
    expect(Number(rule.match(/min-height:(\d+)px/)?.[1])).toBeGreaterThanOrEqual(44)
    expect(Number(rule.match(/min-width:(\d+)px/)?.[1])).toBeGreaterThanOrEqual(44)
    expect(rule).toContain('flex:none')
  })
})

// --- No new hard-coded Thai -------------------------------------------------------
//
// Every file under app/, components/ and lib/ that still writes Thai text directly is
// listed in i18n-thai-baseline.json. The list may only shrink: a new file with Thai text
// fails here (use messages/*.json), and a file translated off the list must be removed
// from it, so it cannot quietly gain Thai text again. Only string, template and JSX text
// literals count -- the only places UI text can live -- so comments may be in any language.
// The file is parsed, not pattern-matched: a regex once read the "/*" inside a comment
// mentioning "messages/*.json" as a block comment and skipped the code after it. The baht
// sign is a currency symbol, not Thai text.

const THAI = /[ก-ฺเ-๛]/
const LITERALS = new Set([
  ts.SyntaxKind.StringLiteral, ts.SyntaxKind.NoSubstitutionTemplateLiteral, ts.SyntaxKind.TemplateHead,
  ts.SyntaxKind.TemplateMiddle, ts.SyntaxKind.TemplateTail, ts.SyntaxKind.JsxText,
])
const hasThaiText = (source: string, path = 'file.tsx') => {
  let found = false
  const visit = (node: ts.Node) => {
    if (found) return
    if (LITERALS.has(node.kind) && THAI.test((node as ts.LiteralLikeNode).text)) { found = true; return }
    ts.forEachChild(node, visit)
  }
  visit(ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, path.endsWith('.ts') ? ts.ScriptKind.TS : ts.ScriptKind.TSX))
  return found
}
// Data, not UI text: Thai province names are the keys of their English names.
const DATA_FILES = new Set(['lib/thai-provinces.ts'])
const thaiFiles = () =>
  ['app', 'components', 'lib'].flatMap(walk).filter(path => !DATA_FILES.has(path) && hasThaiText(read(path), path)).sort()

describe('no new hard-coded Thai', () => {
  it('sees Thai in code, but not in comments, even after a comment that mentions a glob', () => {
    expect(hasThaiText("// see messages/*.json\nconst a = 'ทดสอบ'\n")).toBe(true)
    expect(hasThaiText('const a = <p>ทดสอบ</p>')).toBe(true)
    expect(hasThaiText('const a = `x ${1} ทดสอบ`')).toBe(true)
    expect(hasThaiText("// ทดสอบ\n/* ทดสอบ */\nconst url = 'https://x' // ทดสอบ\n")).toBe(false)
  })

  const baseline: string[] = JSON.parse(read('tests/i18n-thai-baseline.json'))

  it('adds no file with Thai text written into the code', () => {
    const current = thaiFiles()
    expect(current.filter(path => !baseline.includes(path))).toEqual([])
  })

  it('keeps the baseline honest: a translated file comes off the list', () => {
    const current = thaiFiles()
    expect(baseline.filter(path => !current.includes(path))).toEqual([])
  })

  it.each([
    'app/layout.tsx',
    'app/loading.tsx',
    'app/tournaments/page.tsx',
    'components/LanguageSwitch.tsx',
    'components/PageHeader.tsx',
    'components/SiteNav.tsx',
    'app/tournaments/[id]/page.tsx',
    'app/tournaments/[id]/TeamStep.tsx',
    'app/tournaments/[id]/PaymentStep.tsx',
    'app/tournaments/[id]/RegisterSteps.tsx',
    'lib/tournament-dates.ts',
    'lib/public-tournaments.ts',
    'lib/tournament-cover.ts',
    'app/welcome/OnboardingFlow.tsx',
    'app/card/PlayerCardBuilder.tsx',
    'app/card/page.tsx',
    'app/profile/PublicProfileShare.tsx',
    'app/not-found.tsx',
    'app/error.tsx',
    'app/notifications/NotificationList.tsx',
    'app/notifications/page.tsx',
    'components/NotificationBellLink.tsx',
    'lib/notification-unread.ts',
    'app/ranking/RankingFilter.tsx',
    'app/ranking/page.tsx',
    'app/players/[id]/page.tsx',
    'app/players/[id]/ShareProfileButton.tsx',
    'lib/player-profile.ts',
    'app/training/page.tsx',
    'app/training/[programId]/page.tsx',
    'app/training/[programId]/start/page.tsx',
    'app/training/[programId]/start/ScheduleForm.tsx',
    'app/training/[programId]/session/page.tsx',
    'app/training/[programId]/session/SessionRunner.tsx',
    'app/training/drills/[drillId]/page.tsx',
    'app/profile/TrainingCard.tsx',
    'lib/training/content.ts',
    'lib/training/schedule.ts',
    'lib/training/data.ts',
    'app/athletes/AthleteFilters.tsx',
    'components/LoadingModal.tsx',
    'components/VenueCard.tsx',
    'components/VenuePitchCover.tsx',
    'app/venues/page.tsx',
    'app/venues/[id]/page.tsx',
    'app/venues/[id]/VenueGallery.tsx',
    'lib/venue-card-stats.ts',
    'lib/venue-images.ts',
    'lib/venue-sport.ts',
    'app/venue/page.tsx',
    'app/venue/VenueOwnerClient.tsx',
    'app/venue/VenuePhotoManager.tsx',
    'lib/venue-photo-manager.ts',
    'lib/venue-photo-preview.ts',
    'lib/venue-photo-upload.ts',
    'lib/venue-slot-status.ts',
    'lib/api-error.ts',
    'lib/use-api-error-text.ts',
    'lib/venue-photo-errors.ts',
    'app/api/venues/route.ts',
    'app/api/venues/[venueId]/courts/route.ts',
    'app/api/venue-slots/route.ts',
    'app/api/venue-slots/[slotId]/route.ts',
    'app/api/venue-bookings/[bookingId]/route.ts',
    'app/api/venues/[venueId]/photos/route.ts',
    'app/api/venues/[venueId]/photos/[photoId]/route.ts',
    'app/api/venues/[venueId]/photos/[photoId]/preview/route.ts',
    'app/impact/page.tsx',
  ])('keeps %s translated', path => {
    expect(baseline).not.toContain(path)
    expect(hasThaiText(read(path), path)).toBe(false)
  })
})
