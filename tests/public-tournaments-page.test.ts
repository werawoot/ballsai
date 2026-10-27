import { describe, expect, it } from 'vitest'
import { bangkokToday, fetchPublicTournamentsPage, groupTournamentsByMonth, parseTournamentQuery, parseTournamentSort, parseTournamentView, TOURNAMENTS_PAGE_SIZE } from '@/lib/public-tournaments'

type Row = { id: string; start_date: string; end_date: string | null; status: string | null; name?: string; location?: string | null; fee?: number }

// Only the database boundary is faked: a table that answers the filters and order the
// page asks for, so a test sees which rows each tab would really get back.
function fakeSupabase(table: Row[]) {
  const calls: string[] = []
  let rows = [...table]
  let sorted = false
  const builder = {
    select: () => builder,
    gte: (column: keyof Row, value: string) => { calls.push(`${column}>=${value}`); rows = rows.filter(row => String(row[column]) >= value); return builder },
    lt: (column: keyof Row, value: string) => { calls.push(`${column}<${value}`); rows = rows.filter(row => String(row[column]) < value); return builder },
    eq: (column: keyof Row, value: string) => { calls.push(`${column}=${value}`); rows = rows.filter(row => row[column] === value); return builder },
    neq: (column: keyof Row, value: string) => { calls.push(`${column}!=${value}`); rows = rows.filter(row => row[column] !== value); return builder },
    // PostgREST "or" of ilike filters, the shape the search sends: name.ilike.*x*,location.ilike.*x*
    or: (filter: string) => {
      calls.push(`or ${filter}`)
      const parts = filter.split(',').map(part => { const [column, , ...rest] = part.split('.'); return { column: column as keyof Row, needle: new RegExp(rest.join('.').replaceAll('*', '').replaceAll('_', '.'), 'i') } })
      rows = rows.filter(row => parts.some(({ column, needle }) => needle.test(String(row[column] ?? ''))))
      return builder
    },
    order: (column: keyof Row, { ascending }: { ascending: boolean }) => {
      calls.push(`order ${column} ${ascending ? 'asc' : 'desc'}`)
      // The first order decides; the id tiebreak after it only matters for equal dates.
      if (sorted) return builder
      sorted = true
      rows = [...rows].sort((a, b) => (typeof a[column] === 'number' ? Number(a[column]) - Number(b[column]) : String(a[column]).localeCompare(String(b[column]))) * (ascending ? 1 : -1))
      return builder
    },
    range: async (from: number, to: number) => ({ data: rows.slice(from, to + 1), error: null }),
  }
  return { client: { from: () => builder } as never, calls }
}

const row = (id: string, start: string, end = start, status = 'open'): Row => ({ id, start_date: start, end_date: end, status })
const today = '2026-10-01'
const season = [
  row('done-long-ago', '2026-06-01'),
  row('done-yesterday', '2026-09-30', '2026-09-30', 'closed'),
  row('league-running', '2026-09-01', '2026-11-30'),
  row('today', '2026-10-01'),
  row('next-week-closed', '2026-10-08', '2026-10-08', 'closed'),
  row('next-month', '2026-11-09'),
]

describe('public tournaments, one page at a time', () => {
  it('returns the second page and knows it is the last', async () => {
    const many = Array.from({ length: 30 }, (_, index) => row(`t${String(index + 1).padStart(2, '0')}`, `2026-12-${String(index + 1).padStart(2, '0')}`))
    const page = await fetchPublicTournamentsPage(fakeSupabase(many).client, { page: 2, view: 'upcoming', today })
    expect(TOURNAMENTS_PAGE_SIZE).toBe(20)
    expect(page.tournaments.map(item => item.id)).toEqual(['t21', 't22', 't23', 't24', 't25', 't26', 't27', 't28', 't29', 't30'])
    expect(page.hasNext).toBe(false)
  })
})

describe('the three tabs', () => {
  it('upcoming: everything not over yet, soonest first, a running league included', async () => {
    const { client, calls } = fakeSupabase(season)
    const page = await fetchPublicTournamentsPage(client, { page: 1, view: 'upcoming', today })
    expect(page.tournaments.map(item => item.id)).toEqual(['league-running', 'today', 'next-week-closed', 'next-month'])
    expect(calls).toContain('end_date>=2026-10-01')
  })

  it('never lists a draft, even to the organizer whose client can read it (sql/89)', async () => {
    const { client, calls } = fakeSupabase([...season, { ...season[season.length - 1], id: 'my-draft', status: 'draft' }])
    for (const view of ['upcoming', 'open', 'past'] as const) {
      const page = await fetchPublicTournamentsPage(client, { page: 1, view, today })
      expect(page.tournaments.map(item => item.id)).not.toContain('my-draft')
    }
    expect(calls).toContain('status!=draft')
  })

  it('open: only what still takes registrations', async () => {
    const page = await fetchPublicTournamentsPage(fakeSupabase(season).client, { page: 1, view: 'open', today })
    expect(page.tournaments.map(item => item.id)).toEqual(['league-running', 'today', 'next-month'])
  })

  it('past: what is over, most recent first, so page 1 never fills up with old seasons', async () => {
    const page = await fetchPublicTournamentsPage(fakeSupabase(season).client, { page: 1, view: 'past', today })
    expect(page.tournaments.map(item => item.id)).toEqual(['done-yesterday', 'done-long-ago'])
  })

  it('reads the tab from the URL and falls back to upcoming', () => {
    expect(parseTournamentView('past')).toBe('past')
    expect(parseTournamentView(['open', 'past'])).toBe('open')
    for (const bad of [undefined, '', 'all', 'PAST']) expect(parseTournamentView(bad)).toBe('upcoming')
  })
})

describe('dates in Thailand', () => {
  it('turns the day over at midnight Bangkok time, not UTC', () => {
    expect(bangkokToday(new Date('2026-09-30T16:59:00Z'))).toBe('2026-09-30')
    expect(bangkokToday(new Date('2026-09-30T17:00:00Z'))).toBe('2026-10-01')
  })

  it('groups a page by month, keeping the order it came in', () => {
    const groups = groupTournamentsByMonth([row('a', '2026-10-12'), row('b', '2026-10-26'), row('c', '2026-11-09')])
    expect(groups.map(group => [group.month, group.tournaments.map(item => item.id)])).toEqual([
      ['2026-10', ['a', 'b']],
      ['2026-11', ['c']],
    ])
  })
})

describe('search and sort', () => {
  const cups = [
    { ...row('khon', '2026-10-20'), name: 'ศึกเยาวชนขอนแก่น', location: 'สนามกีฬากลาง', fee: 800 },
    { ...row('korat', '2026-10-10'), name: 'โคราชคัพ', location: 'สนามกีฬา อบจ.', fee: 300 },
    { ...row('kk-venue', '2026-11-01'), name: 'ลีกเด็กอีสาน', location: 'ขอนแก่น อารีนา', fee: 0 },
  ]

  it('matches an abbreviation with a dot, and sends the dot as a wildcard, not as filter syntax', async () => {
    const { client, calls } = fakeSupabase([{ ...row('sao', '2026-10-15'), name: 'สระบุรีลีก', location: 'สนามฟุตบอล อ.เสาไห้', fee: 0 }, ...cups])
    const page = await fetchPublicTournamentsPage(client, { page: 1, view: 'upcoming', today, query: 'อ.เสาไห้' })
    expect(page.tournaments.map(item => item.id)).toEqual(['sao'])
    expect(calls).toContain('or name.ilike.*อ_เสาไห้*,location.ilike.*อ_เสาไห้*')
  })

  it('finds a tournament by its name or its venue, without caring about case', async () => {
    const { client } = fakeSupabase(cups)
    const page = await fetchPublicTournamentsPage(client, { page: 1, view: 'upcoming', today, query: 'ขอนแก่น' })
    expect(page.tournaments.map(item => item.id)).toEqual(['khon', 'kk-venue'])
  })

  it('sorts by start date either way, or by the lowest fee first', async () => {
    const ids = async (sort: 'soonest' | 'latest' | 'fee') => (await fetchPublicTournamentsPage(fakeSupabase(cups).client, { page: 1, view: 'upcoming', today, sort })).tournaments.map(item => item.id)
    expect(await ids('soonest')).toEqual(['korat', 'khon', 'kk-venue'])
    expect(await ids('latest')).toEqual(['kk-venue', 'khon', 'korat'])
    expect(await ids('fee')).toEqual(['kk-venue', 'korat', 'khon'])
  })

  it('keeps a search to plain words: nothing that could change the filter reaches the database', () => {
    expect(parseTournamentQuery('  โคราช  คัพ ')).toBe('โคราช คัพ')
    expect(parseTournamentQuery('a,b(c)*d%e\\f"g')).toBe('a b c d e f g')
    expect(parseTournamentQuery('อ.เสาไห้')).toBe('อ.เสาไห้')
    expect(parseTournamentQuery(['x', 'y'])).toBe('x')
    expect(parseTournamentQuery(undefined)).toBe('')
    expect(parseTournamentQuery('ก'.repeat(200))).toHaveLength(60)
  })

  it('reads the sort from the URL, each tab with its own default', () => {
    expect(parseTournamentSort('fee', 'upcoming')).toBe('fee')
    expect(parseTournamentSort(undefined, 'upcoming')).toBe('soonest')
    expect(parseTournamentSort(undefined, 'past')).toBe('latest')
    expect(parseTournamentSort('cheapest', 'open')).toBe('soonest')
  })
})
