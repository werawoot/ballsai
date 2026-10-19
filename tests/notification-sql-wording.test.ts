import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import th from '@/messages/th.json'

// Notification text written by the database reaches people the same way as the message
// files, so it keeps the site's word table (tests/vocabulary.test.ts). This reads the quoted
// text, outside comments, of every notification file from sql/86 on. Rollback files are
// left out: they put back an older file's words on purpose.
const FIRST = 86
const files = readdirSync('sql')
  .filter(name => /^\d+-.*-v1\.sql$/.test(name) && Number(name.split('-')[0]) >= FIRST)
  .filter(name => readFileSync(`sql/${name}`, 'utf8').includes('create_notification'))
const codeOf = (name: string) => readFileSync(`sql/${name}`, 'utf8')
  .split('\n').filter(line => !line.trimStart().startsWith('--')).join('\n')
// Every quoted string, not only the Thai ones: an English word with no Thai letter is shown too.
const quotedIn = (name: string) => [...codeOf(name).matchAll(/'([^']*)'/g)].map(match => match[1])

describe('notification wording in sql/86 and later', () => {
  it('finds the notification files, sql/86 and sql/88 among them', () => {
    expect(files).toEqual(expect.arrayContaining(['86-athlete-family-notifications-v1.sql', '88-notification-wording-v1.sql']))
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
    for (const name of files) expect([name, quotedIn(name).filter(text => pattern.test(text))]).toEqual([name, []])
  })
})

// The newest file that names badges and Hall of Fame categories must use the same Thai
// names as the pages (careerPage.badges, hallPage.category), so a rename cannot leave the
// notifications behind.
const pairs = (code: string, from: string, to: string) => {
  const block = code.slice(code.indexOf(from), code.indexOf(to, code.indexOf(from)))
  return Object.fromEntries([...block.matchAll(/when '([a-z_]+)' then '([^']+)'/g)].map(match => [match[1], match[2]]))
}
const newest = [...files].sort((a, b) => Number(b.split('-')[0]) - Number(a.split('-')[0]))
const latestWith = (marker: string) => newest.find(name => codeOf(name).includes(marker))!

describe('notification names match the pages', () => {
  it('badge names are careerPage.badges', () => {
    const code = codeOf(latestWith('case new.badge_key'))
    const names = Object.fromEntries(Object.entries(th.careerPage.badges).map(([key, value]) => [key, value.name]))
    expect(pairs(code, 'case new.badge_key', 'else')).toEqual(names)
  })

  it('Hall of Fame categories are hallPage.category', () => {
    const code = codeOf(latestWith('case new.category'))
    expect(pairs(code, 'case new.category', 'else')).toEqual(th.hallPage.category)
  })
})
