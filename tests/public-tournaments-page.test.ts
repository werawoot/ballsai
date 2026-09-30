import { describe, expect, it } from 'vitest'
import { bangkokToday, fetchPublicTournamentsPage, groupTournamentsByMonth, parseTournamentView, TOURNAMENTS_PAGE_SIZE } from '@/lib/public-tournaments'

type Row = { id: string; start_date: string; end_date: string | null; status: string | null }

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
    order: (column: keyof Row, { ascending }: { ascending: boolean }) => {
      calls.push(`order ${column} ${ascending ? 'asc' : 'desc'}`)
      // The first order decides; the id tiebreak after it only matters for equal dates.
      if (sorted) return builder
      sorted = true
      rows = [...rows].sort((a, b) => String(a[column]).localeCompare(String(b[column])) * (ascending ? 1 : -1))
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
