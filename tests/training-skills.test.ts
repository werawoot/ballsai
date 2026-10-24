import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { TRAINING_PROGRAMS } from '@/lib/training/content'
import { DRILL_SKILL, SKILLS, drillsForBand, skillsForBand } from '@/lib/training/skills'
import { PAGE_PHOTOS } from '@/lib/stock-photos'

// Owner, 24 Oct 2026: /training in the light glass design, with a row of skills over the
// drills we really have (no empty skill, no "video" or "taught by coaches" claim).
describe('training skills', () => {
  const drillIds = new Set(TRAINING_PROGRAMS.flatMap(program => program.drills.map(drill => drill.id)))

  it('puts every drill in exactly one skill, and names no drill that does not exist', () => {
    for (const id of drillIds) expect(SKILLS, id).toContain(DRILL_SKILL[id])
    for (const id of Object.keys(DRILL_SKILL)) expect(drillIds.has(id), id).toBe(true)
  })

  it('offers only the skills a band has drills for, each drill once', () => {
    for (const band of ['u10_u13', 'u14_u17'] as const) {
      const all = drillsForBand(band)
      expect(new Set(all.map(item => item.drill.id)).size).toBe(all.length)
      for (const skill of skillsForBand(band)) expect(drillsForBand(band, skill).length, `${band} ${skill}`).toBeGreaterThan(0)
      for (const skill of SKILLS.filter(skill => !skillsForBand(band).includes(skill))) expect(drillsForBand(band, skill)).toEqual([])
    }
    // Shooting is only in the older band today, so the younger band shows no shooting chip.
    expect(skillsForBand('u10_u13')).not.toContain('shoot')
    expect(skillsForBand('u14_u17')).toContain('shoot')
  })
})

describe('the /training page', () => {
  const page = readFileSync('app/training/page.tsx', 'utf8')
  const th = JSON.parse(readFileSync('messages/th.json', 'utf8')).training
  const en = JSON.parse(readFileSync('messages/en.json', 'utf8')).training

  it('stands on the light glass design over a real photo with no person', () => {
    expect(page).toMatch(/className="bds-page tg gl gl-scene"/)
    expect(page).toContain('glassSceneStyle(PAGE_PHOTOS.training)')
    expect(PAGE_PHOTOS.training.src).toBe('/photos/head-training-pitch.webp')
  })

  it('says only what is true in the three feature cards', () => {
    for (const messages of [th, en]) {
      const text = JSON.stringify(messages.features)
      expect(Object.keys(messages.features)).toEqual(['age', 'source', 'anywhere'])
      expect(text).not.toMatch(/วิดีโอ|video|ผู้เชี่ยวชาญ|expert/i)
    }
  })

  it('has a label for every skill in both languages', () => {
    for (const skill of ['all', ...SKILLS]) {
      expect(th.skills[skill], skill).toBeTruthy()
      expect(en.skills[skill], skill).toBeTruthy()
    }
  })
})
