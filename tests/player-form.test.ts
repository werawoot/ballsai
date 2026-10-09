import { describe, expect, it } from 'vitest'
import { formHistory, playerTab, ratingChart } from '@/lib/player-form'

const event = (day: number, result: string, after: number, change: number, extra: Record<string, unknown> = {}) => ({
  created_at: `2026-10-${String(day).padStart(2, '0')}T09:00:00Z`, result, rating_after: after, rating_change: change, ...extra,
})

describe("an athlete's form, from verified rating events only", () => {
  it('lists matches newest first with what each one changed', () => {
    const form = formHistory([
      event(24, 'win', 1046, 26, { goals: 2, assists: 1, mvp: true }),
      event(20, 'loss', 1020, -12, { clean_sheet: false }),
      event(18, 'draw', 1032, 32),
    ])
    expect(form.matches.map(item => [item.result, item.ratingAfter, item.change])).toEqual([['win', 1046, 26], ['loss', 1020, -12], ['draw', 1032, 32]])
    expect(form.matches[0]).toMatchObject({ goals: 2, assists: 1, mvp: true, cleanSheet: false, date: '2026-10-24T09:00:00Z' })
    expect(form.lastFive).toEqual(['win', 'loss', 'draw'])
  })

  it('sorts by date itself, whatever order the rows arrive in', () => {
    const form = formHistory([event(18, 'draw', 1032, 32), event(24, 'win', 1046, 26), event(20, 'loss', 1020, -12)])
    expect(form.matches.map(item => item.ratingAfter)).toEqual([1046, 1020, 1032])
  })

  it('keeps only five for the form strip', () => {
    const form = formHistory(Array.from({ length: 7 }, (_, index) => event(index + 1, 'win', 1000 + index, 1)))
    expect(form.lastFive).toHaveLength(5)
    expect(form.matches).toHaveLength(7)
  })

  it('drops a row it cannot trust instead of drawing a default (rule 8)', () => {
    const form = formHistory([event(1, 'win', 1010, 10), event(2, 'forfeit', 1020, 10), { created_at: '2026-10-03', result: 'win', rating_after: null, rating_change: 4 }])
    expect(form.matches).toHaveLength(1)
  })

  it('has no history at all before a first verified match', () => {
    expect(formHistory([])).toEqual({ matches: [], lastFive: [], chart: null })
    expect(formHistory(null)).toEqual({ matches: [], lastFive: [], chart: null })
  })

  it('draws a chart only from two matches on, oldest to newest', () => {
    expect(formHistory([event(1, 'win', 1010, 10)]).chart).toBeNull()
    const chart = formHistory([event(2, 'loss', 1000, -10), event(1, 'win', 1010, 10)]).chart!
    expect(chart).toMatchObject({ min: 1000, max: 1010, first: 1010, last: 1000 })
  })
})

describe('the rating chart', () => {
  it('spans the box with the highest value at the top', () => {
    const chart = ratingChart([1000, 1050, 1025], 300, 100, 10)!
    expect(chart.points).toEqual([[10, 90], [150, 10], [290, 50]])
    expect(chart.line).toBe('M10 90 L150 10 L290 50')
  })

  it('draws a flat line through the middle when nothing changed', () => {
    expect(ratingChart([1000, 1000], 100, 60, 0)!.points).toEqual([[0, 30], [100, 30]])
  })

  it('needs two values', () => {
    expect(ratingChart([1000], 100, 60)).toBeNull()
  })
})

describe('the profile tab', () => {
  it('opens on skills and accepts only the three it has', () => {
    expect(playerTab(undefined)).toBe('skills')
    expect(playerTab('form')).toBe('form')
    expect(playerTab('matches')).toBe('matches')
    expect(playerTab('<script>')).toBe('skills')
  })
})
