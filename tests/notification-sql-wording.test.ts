import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// Notification text written by the database reaches people the same way as the message
// files, so it keeps the site's word table (tests/vocabulary.test.ts). This reads the
// quoted text of sql/86 outside comments.
const source = readFileSync('sql/86-athlete-family-notifications-v1.sql', 'utf8')
  .split('\n').filter(line => !line.trimStart().startsWith('--')).join('\n')
// Every quoted string, not only the Thai ones: ' · Rating ' has no Thai letter but is shown.
const quoted = [...source.matchAll(/'([^']*)'/g)].map(match => match[1])

describe('sql/86 notification wording', () => {
  it('has Thai text to check', () => {
    expect(quoted.filter(text => /[ก-๙]/.test(text)).length).toBeGreaterThan(20)
  })

  it.each([
    ['Power Rating is คะแนนฝีมือ', /Rating|Power/],
    ['XP is แต้ม', /\bXP\b/],
    ['Badge is เหรียญ', /Badge/],
    ['MVP is นักกีฬายอดเยี่ยม', /\bMVP\b/],
    ['Career Passport is ประวัติการเล่น', /Career|Passport/],
    ['Hall of Fame is หอเกียรติยศ', /Hall of Fame/],
    ['ผลการแข่งขัน is ผลแข่ง', /ผลการแข่งขัน/],
  ])('%s', (_name, pattern) => {
    expect(quoted.filter(text => pattern.test(text))).toEqual([])
  })
})
