import { describe, expect, it } from 'vitest'
import { attendanceRates, eventCounts, parseEventInput, splitEvents, attendanceOpen, bangkokIso, eventTimeParts } from '@/lib/team-events'

const now = Date.parse('2026-10-15T10:00:00Z')

describe('a team event, checked before it reaches the database (sql/70)', () => {
  const base = { id: '11111111-1111-4111-8111-111111111111', teamId: '22222222-2222-4222-8222-222222222222', kind: 'training', title: ' ซ้อมทีม ', startsAt: '2026-10-16T10:00:00.000Z', location: ' สนามโรงเรียน ', note: '' }

  it('trims text and turns blanks into nothing', () => {
    expect(parseEventInput(base, now)).toEqual({ id: base.id, teamId: base.teamId, kind: 'training', title: 'ซ้อมทีม', startsAt: '2026-10-16T10:00:00.000Z', location: 'สนามโรงเรียน', note: null })
  })

  it('refuses a missing title, an unknown kind, a bad id, a time too far back or ahead, or long text', () => {
    for (const bad of [
      { ...base, title: '   ' }, { ...base, kind: 'party' }, { ...base, id: 'x' }, { ...base, teamId: 'x' },
      { ...base, startsAt: '2026-10-13T10:00:00Z' }, { ...base, startsAt: '2027-12-01T10:00:00Z' }, { ...base, startsAt: 'soon' },
      { ...base, title: 'x'.repeat(81) }, { ...base, location: 'x'.repeat(121) }, { ...base, note: 'x'.repeat(301) },
    ]) expect(parseEventInput(bad, now)).toBeNull()
  })
})

describe('who is coming', () => {
  it('counts yes, no and not answered among accepted members only', () => {
    const members = ['a', 'b', 'c', 'd']
    const responses = [{ athlete_id: 'a', answer: 'yes' }, { athlete_id: 'b', answer: 'no' }, { athlete_id: 'x', answer: 'yes' }]
    expect(eventCounts(responses, members)).toEqual({ yes: 1, no: 1, waiting: 2 })
  })
})

describe('attendance per athlete', () => {
  it('is the share of recorded sessions they came to, or nothing before any record', () => {
    const rates = attendanceRates([
      { athlete_id: 'a', present: true }, { athlete_id: 'a', present: true }, { athlete_id: 'a', present: false },
      { athlete_id: 'b', present: false },
    ])
    expect(rates.a).toEqual({ attended: 2, recorded: 3, percent: 67 })
    expect(rates.b).toEqual({ attended: 0, recorded: 1, percent: 0 })
    expect(rates.c).toBeUndefined()
  })
})

describe('upcoming and past', () => {
  it('splits by start time, soonest upcoming first and latest past first, leaving out cancelled', () => {
    const events = [
      { id: '1', starts_at: '2026-10-20T10:00:00Z', cancelled_at: null },
      { id: '2', starts_at: '2026-10-16T10:00:00Z', cancelled_at: null },
      { id: '3', starts_at: '2026-10-14T10:00:00Z', cancelled_at: null },
      { id: '4', starts_at: '2026-10-10T10:00:00Z', cancelled_at: null },
      { id: '5', starts_at: '2026-10-17T10:00:00Z', cancelled_at: '2026-10-12T00:00:00Z' },
    ]
    const { upcoming, past } = splitEvents(events, now)
    expect(upcoming.map(event => event.id)).toEqual(['2', '1'])
    expect(past.map(event => event.id)).toEqual(['3', '4'])
  })
})

describe('Bangkok time and the attendance window', () => {
  it('reads a typed date and time as Bangkok time, whatever the device zone', () => {
    expect(bangkokIso('2026-10-14', '17:00')).toBe('2026-10-14T10:00:00.000Z')
    expect(bangkokIso('2026-10-14', '')).toBeNull()
    expect(bangkokIso('14/10/2026', '17:00')).toBeNull()
  })

  it('opens attendance 12 hours before the start, as set_team_attendance does', () => {
    const now = Date.parse('2026-10-14T00:00:00Z')
    expect(attendanceOpen('2026-10-14T12:00:00Z', now)).toBe(true)
    expect(attendanceOpen('2026-10-14T12:00:01Z', now)).toBe(false)
    expect(attendanceOpen('2026-10-13T12:00:00Z', now)).toBe(true)
  })
})

describe('event time on screen', () => {
  it('gives Bangkok weekday, date and time without Intl names', () => {
    expect(eventTimeParts('2026-10-14T10:00:00Z')).toEqual({ weekday: 3, day: 14, month: 10, time: '17:00' })
    expect(eventTimeParts('2026-10-14T20:30:00Z')).toEqual({ weekday: 4, day: 15, month: 10, time: '03:30' })
  })
})
