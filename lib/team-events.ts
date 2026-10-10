// Team sessions and matches (sql/70): checked input for a save, who is coming, and each
// athlete's attendance. The database decides who may do what; these keep the screens and
// the API honest about what they send and show.

export type EventKind = 'training' | 'match'
export type EventInput = { id: string; teamId: string; kind: EventKind; title: string; startsAt: string; location: string | null; note: string | null }
export type EventRow = { id: string; starts_at: string; cancelled_at: string | null }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const DAY = 24 * 60 * 60 * 1000
const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '')

export function parseEventInput(input: unknown, now = Date.now()): EventInput | null {
  if (!input || typeof input !== 'object') return null
  const raw = input as Record<string, unknown>
  const id = text(raw.id), teamId = text(raw.teamId), title = text(raw.title), location = text(raw.location), note = text(raw.note)
  const startsAt = Date.parse(text(raw.startsAt))
  if (!UUID.test(id) || !UUID.test(teamId)) return null
  if (raw.kind !== 'training' && raw.kind !== 'match') return null
  if (!title || title.length > 80 || location.length > 120 || note.length > 300) return null
  if (Number.isNaN(startsAt) || startsAt < now - DAY || startsAt > now + 366 * DAY) return null
  return { id, teamId, kind: raw.kind, title, startsAt: new Date(startsAt).toISOString(), location: location || null, note: note || null }
}

export function eventCounts(responses: { athlete_id: string; answer: string }[], members: string[]) {
  const onTeam = new Set(members)
  const answered = responses.filter(response => onTeam.has(response.athlete_id))
  const yes = answered.filter(response => response.answer === 'yes').length
  const no = answered.filter(response => response.answer === 'no').length
  return { yes, no, waiting: members.length - yes - no }
}

export function attendanceRates(rows: { athlete_id: string; present: boolean }[]) {
  const rates: Record<string, { attended: number; recorded: number; percent: number }> = {}
  for (const row of rows) {
    const rate = (rates[row.athlete_id] ??= { attended: 0, recorded: 0, percent: 0 })
    rate.recorded += 1
    if (row.present) rate.attended += 1
    rate.percent = Math.round(rate.attended / rate.recorded * 100)
  }
  return rates
}

export function splitEvents<Row extends EventRow>(events: Row[], now = Date.now()) {
  const live = events.filter(event => !event.cancelled_at)
  return {
    upcoming: live.filter(event => Date.parse(event.starts_at) > now).sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at)),
    past: live.filter(event => Date.parse(event.starts_at) <= now).sort((a, b) => Date.parse(b.starts_at) - Date.parse(a.starts_at)),
  }
}

// The product runs in Thailand: a date and time typed by a coach is Bangkok time (UTC+7,
// no daylight saving), whatever the phone's or the server's own zone is.
export function bangkokIso(date: string, time: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return null
  const at = Date.parse(`${date}T${time}:00+07:00`)
  return Number.isNaN(at) ? null : new Date(at).toISOString()
}

// Bangkok date parts, worked out by hand: Intl's Thai names differ between Node and
// browsers (the server spells the weekday in full, Chrome abbreviates it), which breaks
// hydration. The screen words the weekday from messages (teamEvents.weekdays) and lays
// out the numbers itself.
export function eventTimeParts(iso: string) {
  const at = new Date(Date.parse(iso) + 7 * 60 * 60 * 1000)
  const pad = (value: number) => String(value).padStart(2, '0')
  return { weekday: at.getUTCDay() as 0 | 1 | 2 | 3 | 4 | 5 | 6, day: at.getUTCDate(), month: at.getUTCMonth() + 1, time: `${pad(at.getUTCHours())}:${pad(at.getUTCMinutes())}` }
}

// Matches set_team_attendance: the coach ticks names from 12 hours before the start.
export const attendanceOpen = (startsAt: string, now = Date.now()) => Date.parse(startsAt) <= now + 12 * 60 * 60 * 1000
