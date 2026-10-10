// Minutes played (sql/74): after a confirmed match, the coach records who started and the
// minute each substitute came on or anyone went off. Minutes are computed, never typed.
// AGENTS.md rule 8: this is the coach's record, labelled as such, not a verified
// performance. These checks mirror save_match_minutes.

export type MinuteEntry = { athleteId: string; started: boolean; on: number | null; off: number | null }
export const MATCH_LENGTHS = [40, 50, 60, 70, 80, 90]
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const whole = (value: unknown) => typeof value === 'number' && Number.isInteger(value)

export const entryMinutes = (entry: MinuteEntry, length: number) => (entry.off ?? length) - (entry.on ?? 0)

/** The entries as the database will store them, or null if any would be refused. */
export function cleanMinuteEntries(input: unknown, length: number): MinuteEntry[] | null {
  if (!whole(length) || length < 20 || length > 120 || !Array.isArray(input) || input.length > 40) return null
  const seen = new Set<string>()
  const entries: MinuteEntry[] = []
  for (const raw of input) {
    if (!raw || typeof raw !== 'object') return null
    const { athleteId, started, on = null, off = null } = raw as Record<string, unknown>
    if (typeof athleteId !== 'string' || !UUID.test(athleteId) || seen.has(athleteId) || typeof started !== 'boolean') return null
    if ((on !== null && !whole(on)) || (off !== null && !whole(off))) return null
    if (started !== (on === null)) return null
    if (on !== null && ((on as number) < 0 || (on as number) > length - 1)) return null
    if (off !== null && ((off as number) < 1 || (off as number) > length || (off as number) <= ((on as number | null) ?? 0))) return null
    seen.add(athleteId)
    entries.push({ athleteId, started, on: on as number | null, off: off as number | null })
  }
  return entries
}

/** Matches, starts and minutes per athlete from the stored rows. */
export function minutesTotals(rows: { athlete_id: string; started: boolean; minutes: number }[]) {
  const totals: Record<string, { matches: number; starts: number; minutes: number }> = {}
  for (const row of rows) {
    const total = (totals[row.athlete_id] ??= { matches: 0, starts: 0, minutes: 0 })
    total.matches += 1
    total.starts += row.started ? 1 : 0
    total.minutes += row.minutes
  }
  return totals
}
