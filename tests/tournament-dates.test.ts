import { describe, expect, it } from 'vitest'
import { tournamentDateRange, tournamentDayBox, tournamentFee, tournamentMonthLabel } from '@/lib/tournament-dates'

describe('tournament dates on screen', () => {
  it('shows the calendar day as stored, in either language', () => {
    expect(tournamentDayBox('en', '2026-10-01')).toEqual({ day: '1', month: 'Oct' })
    expect(tournamentDayBox('th', '2026-10-12').day).toBe('12')
    expect(tournamentDayBox('th', '2026-10-12').month).toBe('ต.ค.')
  })

  it('uses the Gregorian year in Thai, like the rest of the app', () => {
    expect(tournamentMonthLabel('th', '2026-10')).toBe('ตุลาคม 2026')
    expect(tournamentMonthLabel('en', '2026-11')).toBe('November 2026')
  })

  it('says one day once and a multi-day tournament as a range', () => {
    expect(tournamentDateRange('en', '2026-10-12', '2026-10-12')).toBe('Mon, 12 Oct 2026')
    expect(tournamentDateRange('en', '2026-10-12', null)).toBe('Mon, 12 Oct 2026')
    expect(tournamentDateRange('en', '2026-10-12', '2026-10-13')).toBe('12 Oct – Tue, 13 Oct 2026')
  })

  it('never prints a free tournament as ฿0', () => {
    expect(tournamentFee(500)).toBe('฿500')
    expect(tournamentFee(1500)).toBe('฿1,500')
    for (const fee of [0, null, undefined, Number.NaN]) expect(tournamentFee(fee)).toBeNull()
  })
})
