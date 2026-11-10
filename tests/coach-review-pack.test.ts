import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { renderPack, SELF_TESTS } from '../scripts/coach-review-pack.mjs'
import programs from '@/content/training/programs.json'
import th from '@/messages/th.json'

// docs/training/coach-review-pack.md is what a coach signs off (ADR-015 gate 1). The committed file
// must be exactly what the generator makes from the app's data and Thai labels today, so a change
// to any drill, dose, timer, access level, source or the review status shows up as a failing test.
const pack = readFileSync(new URL('../docs/training/coach-review-pack.md', import.meta.url), 'utf8')

describe('the coach review pack', () => {
  it('is exactly what the generator makes from programs.json and messages/th.json', () => {
    expect(pack).toBe(renderPack(programs, th))
  })

  it('uses the access words children see in the app', () => {
    for (const label of Object.values(th.training.access)) expect(typeof label).toBe('string')
    expect(pack).toContain(th.training.access.solo)
    expect(pack).not.toContain('| ทำเองได้ |')
  })

  it('asks about the three self-tests with their safety rules and leaves room for a signature', () => {
    for (const test of SELF_TESTS) expect(pack).toContain(test.name)
    expect(pack).toContain('ไม่นำไปคิดคะแนนฝีมือ')
    expect(pack).toContain('พื้นนุ่มไม่ลื่น')
    expect(pack).toContain('## การรับรอง')
  })
})
