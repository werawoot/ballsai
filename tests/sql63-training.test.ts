import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { TRAINING_PROGRAMS } from '@/lib/training/content'

// sql/63-training-v1.sql, read as text: the rules in docs/training-flow-v1.md that the
// database itself must hold. Behaviour was drilled on Postgres 16 (runbook row 63).
const sql = readFileSync(new URL('../sql/63-training-v1.sql', import.meta.url), 'utf8')
const code = sql.split('\n').filter(line => !line.trimStart().startsWith('--')).join('\n')

describe('SQL63 training', () => {
  it('lets the database start exactly the programmes the app lets an athlete start alone', () => {
    const list = code.match(/select array\[([^\]]+)\]::text\[\]/)?.[1].split(',').map(item => item.trim().replace(/'/g, '')) ?? []
    expect(list.sort()).toEqual(TRAINING_PROGRAMS.filter(program => program.access === 'solo').map(program => program.id).sort())
    expect(list).not.toContain('u16-hip-groin-01')
  })

  it('stores no pain answer and no XP', () => {
    expect(code).not.toMatch(/pain|injur|xp_|athlete_xp_events|athlete_progress/i)
  })

  it('is private: no anon access, owner writes, guardian and admin read', () => {
    expect(code).toMatch(/revoke all on public\.training_enrollments, public\.training_checkins from public, anon;/)
    expect(code).toMatch(/is_accepted_guardian_for\(athlete_id\)/)
    expect(code).not.toMatch(/to anon/)
  })

  it('never lets a row change owner or programme, and cannot double count a day', () => {
    expect(code).toMatch(/grant update \(weekdays, status\) on public\.training_enrollments to authenticated;/)
    expect(code).toMatch(/unique \(enrollment_id, session_date\)/)
    expect(code).toMatch(/where status = 'active'/)
    expect(code).toMatch(/pg_advisory_xact_lock/)
  })

  it('goes away with the athlete (PDPA deletion)', () => {
    expect(code.match(/references public\.athlete_profiles\(user_id\) on delete cascade/g)?.length).toBe(2)
  })
})
