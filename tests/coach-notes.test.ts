import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { HEALTH_WORDS_EN, HEALTH_WORDS_TH, NOTE_CATEGORIES, NOTE_MAX, healthWord, parseNoteInput } from '@/lib/coach-notes'

// Coach notes about an athlete (sql/73, docs/research/coach-notes-pdpa-2026-10-10.md).
const ID = '11111111-1111-4111-8111-111111111111'
const TEAM = '22222222-2222-4222-8222-222222222222'
const ATHLETE = '33333333-3333-4333-8333-333333333333'

describe('the health check before a note is saved', () => {
  it('finds health and medical words and leaves football words alone', () => {
    expect(healthWord('เจ็บข้อเท้าซ้าย')).toBe('เจ็บ')
    expect(healthWord('ไปหาหมอมา')).toBe('หมอ')
    expect(healthWord('Knee injury last week')).toBe('injur')
    for (const ok of ['วิ่งจนหอบแต่ไม่หยุด', 'พลิกเกมได้ดี', 'แพ้ 2-1 แต่สู้', 'great skill and pace', 'ทำสมาธิดี']) expect(healthWord(ok)).toBeNull()
  })

  it('uses the same words as the database check', () => {
    const sql = readFileSync('sql/73-coach-notes-v1.sql', 'utf8')
    const thai = [...sql.match(/unnest\(array\[([\s\S]*?)\]\)/)![1].matchAll(/'([^']+)'/g)].map(match => match[1])
    const english = sql.match(/\\m\(([^)]+)\)/)![1].split('|')
    expect(thai).toEqual(HEALTH_WORDS_TH)
    expect(english).toEqual(HEALTH_WORDS_EN)
  })
})

describe('a note the database will accept', () => {
  it('trims the text and keeps the ids and category', () => {
    expect(parseNoteInput({ id: ID, teamId: TEAM, athleteId: ATHLETE, category: 'goal', body: '  ฝึกยิงเท้าซ้าย  ' }))
      .toEqual({ id: ID, teamId: TEAM, athleteId: ATHLETE, category: 'goal', body: 'ฝึกยิงเท้าซ้าย' })
  })

  it('refuses a health word, an unknown category, an empty or too long text and bad ids', () => {
    const base = { id: ID, teamId: TEAM, athleteId: ATHLETE, category: 'technical', body: 'x' }
    for (const input of [
      { ...base, body: 'เจ็บเข่า' }, { ...base, category: 'attitude' }, { ...base, body: '   ' },
      { ...base, body: 'ก'.repeat(NOTE_MAX + 1) }, { ...base, id: 'x' }, { ...base, athleteId: 'x' }, null,
    ]) expect(parseNoteInput(input)).toBeNull()
    expect(parseNoteInput({ ...base, body: 'ก'.repeat(NOTE_MAX) })).not.toBeNull()
    expect(NOTE_CATEGORIES).toEqual(['technical', 'tactical', 'physical', 'teamwork', 'goal'])
  })
})
