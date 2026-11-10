import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { TRAINING_PROGRAMS, TRAINING_SOURCES } from '@/lib/training/content'

// docs/training/coach-review-pack.md is what a coach signs off (ADR-015 gate 1). It is generated
// from content/training/programs.json; this keeps it from drifting from what the app shows.
const pack = readFileSync(new URL('../docs/training/coach-review-pack.md', import.meta.url), 'utf8')

describe('the coach review pack', () => {
  it('lists every programme, every drill as the app words it, and every source', () => {
    for (const program of TRAINING_PROGRAMS) {
      expect(pack, program.id).toContain(program.code)
      for (const drill of program.drills) {
        expect(pack, drill.id).toContain(drill.name.th)
        expect(pack, drill.id).toContain(drill.how.th.replace(/\|/g, '\\|'))
        expect(pack, drill.id).toContain(drill.dose.th)
      }
    }
    for (const source of Object.values(TRAINING_SOURCES)) expect(pack).toContain(source.url)
  })

  it('asks about the three proposed self-tests and leaves room for a signature', () => {
    for (const test of ['เดาะบอลเท้าข้างถนัด', 'แพลงก์ศอก', 'กระโดดไกลยืนสองขา']) expect(pack).toContain(test)
    expect(pack).toContain('## การรับรอง')
  })
})
