// Coach notes about an athlete (sql/73). Built to docs/research/coach-notes-pdpa-2026-10-10.md:
// a fixed category, at most 280 characters, and no health or medical words (PDPA s. 26
// sensitive data). The database refuses the same things; these lists must stay equal to
// the ones in sql/73-coach-notes-v1.sql (tests/coach-notes.test.ts compares them). The words
// live in content/coach-notes/health-words.json so no Thai text sits in the code.
import words from '@/content/coach-notes/health-words.json'

export const NOTE_CATEGORIES = ['technical', 'tactical', 'physical', 'teamwork', 'goal'] as const
export type NoteCategory = (typeof NOTE_CATEGORIES)[number]
export const NOTE_MAX = 280

export const HEALTH_WORDS_TH: string[] = words.th
export const HEALTH_WORDS_EN: string[] = words.en
const ENGLISH = new RegExp(`\\b(${HEALTH_WORDS_EN.join('|')})`, 'i')
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/** The first health or medical word in a text, or null (Thai anywhere, English at a word start). */
export function healthWord(text: string): string | null {
  const thai = HEALTH_WORDS_TH.find(word => text.includes(word))
  if (thai) return thai
  return text.match(ENGLISH)?.[1].toLowerCase() ?? null
}

export type NoteInput = { id: string; teamId: string; athleteId: string; category: NoteCategory; body: string }

export function parseNoteInput(input: unknown): NoteInput | null {
  if (!input || typeof input !== 'object') return null
  const { id, teamId, athleteId, category, body } = input as Record<string, unknown>
  if (![id, teamId, athleteId].every(value => typeof value === 'string' && UUID.test(value))) return null
  if (typeof category !== 'string' || !(NOTE_CATEGORIES as readonly string[]).includes(category)) return null
  const text = typeof body === 'string' ? body.trim() : ''
  if (!text || text.length > NOTE_MAX || healthWord(text)) return null
  return { id: id as string, teamId: teamId as string, athleteId: athleteId as string, category: category as NoteCategory, body: text }
}
