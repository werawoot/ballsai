import { describe, expect, it } from 'vitest'
import { DAY_LIMITS, addDays, addWeeks, cleanPlanDays, libraryDrills, planSummary, weekStartOf } from '@/lib/team-training'

// A team's weekly training plan (sql/72). The page and the API check a plan the way the
// database does, so a coach hears about a mistake before saving.
const block = (over: Record<string, unknown> = {}) => ({ drill: null, name: 'เกมเล็ก 5 ต่อ 5', minutes: 25, load: 2, ...over })

describe('the week a plan belongs to', () => {
  it('is the Monday of the Bangkok week, whatever the device zone', () => {
    // Sunday 11 Oct 2026, 23:30 in Bangkok (16:30 UTC) still belongs to the week of 5 Oct.
    expect(weekStartOf(Date.parse('2026-10-12T16:30:00Z'))).toBe('2026-10-12')
    expect(weekStartOf(Date.parse('2026-10-11T16:30:00Z'))).toBe('2026-10-05')
    expect(weekStartOf(Date.parse('2026-10-05T00:00:00Z'))).toBe('2026-10-05')
  })
})

describe('a plan the database will accept', () => {
  it('trims text, sorts days and keeps a library id only when it is one', () => {
    const days = cleanPlanDays([
      { day: 3, title: ' เกมเล็ก ', blocks: [block({ name: ' เกม ' })] },
      { day: 1, title: '', blocks: [block({ drill: 'a1-react-jog', name: 'วิ่ง', minutes: 10, load: 1 })] },
    ])
    expect(days).toEqual([
      { day: 1, title: '', blocks: [{ drill: 'a1-react-jog', name: 'วิ่ง', minutes: 10, load: 1 }] },
      { day: 3, title: 'เกมเล็ก', blocks: [{ drill: null, name: 'เกม', minutes: 25, load: 2 }] },
    ])
  })

  it('refuses what the database refuses', () => {
    for (const days of [
      [{ day: 7, blocks: [block()] }],
      [{ day: 1, blocks: [block()] }, { day: 1, blocks: [block()] }],
      [{ day: 1, blocks: [] }],
      [{ day: 1, blocks: Array.from({ length: 9 }, () => block({ minutes: 5 })) }],
      [{ day: 1, blocks: [block({ name: '  ' })] }],
      [{ day: 1, blocks: [block({ name: 'ก'.repeat(81) })] }],
      [{ day: 1, title: 'ก'.repeat(61), blocks: [block()] }],
      [{ day: 1, blocks: [block({ minutes: 0 })] }],
      [{ day: 1, blocks: [block({ minutes: 2.5 })] }],
      [{ day: 1, blocks: [block({ load: 4 })] }],
      [{ day: 1, blocks: [block({ drill: 'Bad Id!' })] }],
      [{ day: 1, blocks: [block({ minutes: 120 }), block({ minutes: 121 })] }],
      'not a list',
    ]) expect(cleanPlanDays(days)).toBeNull()
    expect(DAY_LIMITS).toEqual({ blocks: 8, minutes: 120, dayMinutes: 240, title: 60, name: 80 })
  })

  it('accepts an empty week, which removes the plan', () => {
    expect(cleanPlanDays([])).toEqual([])
  })
})

describe('the week at a glance', () => {
  it('counts training days, minutes and the load, weighted by minutes', () => {
    expect(planSummary([
      { day: 1, title: '', blocks: [block({ minutes: 10, load: 1 }), block({ minutes: 20, load: 3 })] },
      { day: 3, title: '', blocks: [block({ minutes: 30, load: 2 })] },
    ])).toEqual({ days: 2, minutes: 60, load: 2 })
    expect(planSummary([])).toEqual({ days: 0, minutes: 0, load: null })
  })
})

describe('the drill library', () => {
  it('lists every reviewed drill a coach may run, with whole minutes and its programme', () => {
    const drills = libraryDrills('th')
    expect(drills.length).toBeGreaterThan(30)
    expect(new Set(drills.map(drill => drill.id)).size).toBe(drills.length)
    expect(drills.every(drill => drill.minutes >= 1 && Number.isInteger(drill.minutes) && drill.group.length > 0)).toBe(true)
    expect(drills.find(drill => drill.id === 'a1-react-jog')).toMatchObject({ name: 'วิ่งเหยาะ หยุดและเปลี่ยนทิศตามสัญญาณ', minutes: 2 })
    expect(libraryDrills('en').find(drill => drill.id === 'a1-react-jog')?.name).toBe('Jog, stop and turn on a signal')
  })
})

describe('dates in a plan', () => {
  it('moves by days and weeks across a month end', () => {
    expect(addDays('2026-10-26', 6)).toBe('2026-11-01')
    expect(addWeeks('2026-10-26', 1)).toBe('2026-11-02')
  })
})
