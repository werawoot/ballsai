// How a tournament's dates read on screen. The columns are plain calendar days
// (YYYY-MM-DD, Thai local days), so they are formatted as UTC midnight to keep the day
// from shifting with the server's time zone. Thai uses the Gregorian year on purpose: the
// app says "2026" everywhere else (season, cards), and two calendars on one screen confuse.

const intlLocale = (locale: string) => locale === 'th' ? 'th-TH-u-ca-gregory' : 'en-GB'
const asDate = (day: string) => new Date(`${day.slice(0, 10)}T00:00:00Z`)
const format = (locale: string, options: Intl.DateTimeFormatOptions, day: string) =>
  new Intl.DateTimeFormat(intlLocale(locale), { timeZone: 'UTC', ...options }).format(asDate(day))

/** The big date box on a card: "12" over "ต.ค." / "Oct". */
export function tournamentDayBox(locale: string, day: string) {
  return { day: String(Number(day.slice(8, 10))), month: format(locale, { month: 'short' }, day) }
}

/** A month heading from YYYY-MM: "ตุลาคม 2026" / "October 2026". */
export function tournamentMonthLabel(locale: string, month: string) {
  return format(locale, { month: 'long', year: 'numeric' }, `${month}-01`)
}

/** The full date, or range when the tournament runs over several days. */
export function tournamentDateRange(locale: string, start: string, end?: string | null) {
  const long = { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' } as const
  if (!end || end.slice(0, 10) === start.slice(0, 10)) return format(locale, long, start)
  return `${format(locale, { day: 'numeric', month: 'short' }, start)} – ${format(locale, long, end)}`
}

/** "฿500"; a free tournament says so instead of "฿0". */
export function tournamentFee(fee: number | null | undefined): string | null {
  const value = Number(fee)
  if (!Number.isFinite(value) || value <= 0) return null
  return `฿${value.toLocaleString('en-US')}`
}
