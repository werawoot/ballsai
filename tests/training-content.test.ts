import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { TRAINING_PROGRAMS, TRAINING_SOURCES, bandForAge, canSelfStart, coachDrills, drillImage, findDrill, sessionDrills } from '@/lib/training/content'

// docs/training-flow-v1.md, locked rules. The content file is the product here: these
// checks are what stop a drill shipping without its source, licence or picture.
const root = fileURLToPath(new URL('../public', import.meta.url))
const SOURCE_FIELDS = ['title', 'author', 'url', 'doi', 'license', 'commercialUse', 'adaptationAllowed', 'attribution', 'sourceMediaLicense', 'evidenceLevel', 'licenseVerifiedAt', 'licenseVerificationMethod']
const drills = TRAINING_PROGRAMS.flatMap(program => program.drills.map(drill => ({ program, drill })))

describe('every drill can say where it comes from (rule 1)', () => {
  it.each(Object.entries(TRAINING_SOURCES))('source %s has every provenance field', (_key, source) => {
    for (const field of SOURCE_FIELDS) expect(source, field).toHaveProperty(field)
    expect(source.url).toMatch(/^https:\/\//)
    expect(source.commercialUse).toBe(true)
    expect(source.licenseVerifiedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it.each(drills.map(({ drill }) => [drill.id, drill] as const))('%s names a known source, has both languages and our own picture', (_id, drill) => {
    expect(TRAINING_SOURCES[drill.source]).toBeTruthy()
    for (const field of ['name', 'how', 'dose'] as const) {
      expect(drill[field].th.trim()).not.toBe('')
      expect(drill[field].en.trim()).not.toBe('')
      expect(drill[field].en).not.toMatch(/[ก-๛]/)
    }
    expect(existsSync(`${root}${drillImage(drill.id)}`)).toBe(true)
  })

  it('has unique drill ids', () => {
    const ids = drills.map(({ drill }) => drill.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(findDrill('c4-plank')?.source?.license).toBe('CC BY 4.0')
  })

  it('names every programme as ours: never FIFA, 11+ or Knee Control+', () => {
    for (const program of TRAINING_PROGRAMS) {
      expect(program.code).toMatch(/^BallDoenSai /)
      for (const text of [program.code, program.title.th, program.title.en]) expect(text).not.toMatch(/FIFA|11\+|Knee Control/i)
      expect(existsSync(`${root}${drillImage(program.cover)}`)).toBe(true)
    }
  })
})

describe('access levels (rule 3)', () => {
  it('builds a self-training session from solo drills only', () => {
    for (const program of TRAINING_PROGRAMS) expect(sessionDrills(program).every(drill => drill.access === 'solo')).toBe(true)
  })

  it('keeps the Nordic exercise for a coach', () => {
    expect(findDrill('c13-nordic')?.drill.access).toBe('coach_guided')
    expect(sessionDrills(TRAINING_PROGRAMS.find(p => p.id === 'u14-prevention-01')!).map(d => d.id)).not.toContain('c13-nordic')
    expect(coachDrills(TRAINING_PROGRAMS.find(p => p.id === 'u14-prevention-01')!).map(d => d.id)).toEqual(['c13-nordic'])
  })

  it('never lets anyone start the hip and groin programme alone, at any age', () => {
    const groin = TRAINING_PROGRAMS.find(p => p.id === 'u16-hip-groin-01')!
    expect(groin.access).toBe('coach_guided')
    expect(groin.minAge).toBe(16)
    for (const age of [10, 15, 16, 17, null]) expect(canSelfStart(groin, age)).toBe(false)
    expect(groin.drills).toEqual([])
  })
})

describe('wording matches the evidence (rule 4)', () => {
  it('does not claim the hip and groin programme prevents injury', () => {
    const groin = TRAINING_PROGRAMS.find(p => p.id === 'u16-hip-groin-01')!
    for (const text of [groin.goal.th, groin.claim.th]) expect(text).not.toMatch(/ป้องกัน/)
    for (const text of [groin.goal.en, groin.claim.en]) expect(text).not.toMatch(/prevent/i)
  })
})

describe('age bands', () => {
  it('opens the right band, and none without an age', () => {
    expect([8, 10, 13, 14, 17, 19].map(bandForAge)).toEqual(['u10_u13', 'u10_u13', 'u10_u13', 'u14_u17', 'u14_u17', 'u14_u17'])
    expect(bandForAge(null)).toBeNull()
  })
})
