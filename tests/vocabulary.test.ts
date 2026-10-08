import { describe, expect, it } from 'vitest'
import th from '@/messages/th.json'
import en from '@/messages/en.json'

// UX report 8, word table: one word for each product idea across the whole site, chosen so a
// 12-year-old and an adult who is not good with the web read the same thing everywhere.
// These checks read the message files, so a new message that brings back an old word fails here.

type Tree = { [key: string]: string | Tree }
const flatten = (tree: Tree, prefix = ''): Record<string, string> =>
  Object.fromEntries(Object.entries(tree).flatMap(([key, value]) =>
    typeof value === 'string' ? [[`${prefix}${key}`, value]] : Object.entries(flatten(value, `${prefix}${key}.`))))
const TH = flatten(th as Tree)
const EN = flatten(en as Tree)
const hits = (messages: Record<string, string>, pattern: RegExp) =>
  Object.entries(messages).filter(([, value]) => pattern.test(value)).map(([key]) => key)

describe('Thai: the same idea has the same word everywhere', () => {
  const retired: Array<[string, RegExp]> = [
    ['Player Card is การ์ดนักกีฬา', /Player Card|การ์ดนักเตะ/],
    ['STARTER is การ์ดเริ่มต้น', /STARTER/],
    ['Power Rating, Rating and Power are คะแนนฝีมือ', /Power Rating|\bRating\b|\bPower\b/],
    ['Ranking is อันดับ', /Ranking/],
    ['XP and Level are แต้ม and ระดับ', /\bXP\b|\bLevel\b/],
    ['Career Passport and Timeline are ประวัติการเล่น', /Career|Passport|Timeline/],
    ['Hall of Fame is หอเกียรติยศ', /Hall of Fame/],
    ['นักเตะ and ผู้เล่น are นักกีฬา', /นักเตะ|ผู้เล่น/],
    ['รายการแข่งขัน is รายการแข่ง, ผลการแข่งขัน is ผลแข่ง', /รายการแข่งขัน|ผลการแข่งขัน/],
    ['self-entered is ฉันกรอกเอง', /ข้อมูลที่กรอกเอง|ข้อมูลกรอกเอง/],
  ]
  it.each(retired)('%s', (_name, pattern) => {
    expect(hits(TH, pattern)).toEqual([])
  })

  it('says ทุกคนเห็น / เห็นแค่ฉัน for the profile audience', () => {
    expect(TH['profileHome.visibility.public']).toBe('ทุกคนเห็น')
    expect(TH['profileHome.visibility.private']).toBe('เห็นแค่ฉัน')
    expect(TH['profileHome.actions.viewPublic']).toBe('ดูโปรไฟล์ที่ทุกคนเห็น')
    expect(EN['profileHome.visibility.public']).toBe('Everyone can see')
    expect(EN['profileHome.visibility.private']).toBe('Only me')
  })

  it('labels where a fact comes from with the same three phrases', () => {
    expect(TH['profileHome.verification.self']).toBe('ฉันกรอกเอง')
    expect(TH['profileHome.verification.coach_verified']).toBe('โค้ชยืนยันแล้ว')
    expect(TH['profileHome.verification.performance_verified']).toBe('ผลแข่งยืนยันแล้ว')
    expect(TH['player.verification.coach_verified']).toBe('โค้ชยืนยันแล้ว')
    expect(TH['player.verification.performance_verified']).toBe('ผลแข่งยืนยันแล้ว')
    expect(TH['card.provenance.coach']).toBe('โค้ชยืนยันแล้ว')
    expect(TH['card.provenance.performanceNoCount']).toBe('ผลแข่งยืนยันแล้ว')
    expect(TH['card.provenance.self']).toBe('ฉันกรอกเอง · ยังไม่มีผลแข่ง')
  })

  it('keeps saying that a starter card has no match results yet (AGENTS rule 8)', () => {
    expect(TH['profileHome.card.starterTitle']).toBe('การ์ดเริ่มต้น')
    expect(TH['player.starterChip']).toBe('การ์ดเริ่มต้น')
    expect(TH['card.starterLabel']).toBe('การ์ดเริ่มต้น')
    expect(TH['profileHome.card.starterBody']).toMatch(/ยังไม่มี/)
    expect(TH['profileHome.card.starterBody']).toMatch(/ผลแข่ง/)
    expect(TH['player.noSeasonText']).toMatch(/นัดแรก/)
    expect(TH['card.provenance.self']).toMatch(/ยังไม่มีผลแข่ง/)
  })

  it('names the bottom tabs after what they open', () => {
    expect(TH['nav.items.discover']).toBe('นักกีฬา')
    expect(EN['nav.items.discover']).toBe('Athletes')
    // The fifth tab opens the person's own work, whoever they are (report 9, D1).
    expect(TH['nav.items.profile']).toBe('ของฉัน')
    expect(EN['nav.items.profile']).toBe('Me')
  })
})

describe('English: one form of each product name', () => {
  it('writes "Player card" and "Starter card" the same way everywhere', () => {
    expect(hits(EN, /Player Card/)).toEqual([])
    expect(hits(EN, /STARTER/)).toEqual([])
    expect(EN['card.starterLabel']).toBe('Starter card')
    expect(EN['profileHome.card.starterTitle']).toBe('Starter card')
    expect(EN['player.starterChip']).toBe('Starter card')
  })

  it('never shortens Power Rating to Rating or Power', () => {
    expect(hits(EN, /(?<!Power )\bRating\b/)).toEqual([])
    expect(hits(EN, /\bPower\b(?! Rating)/)).toEqual([])
  })

  it('uses the plain phrases for where a fact comes from', () => {
    expect(EN['profileHome.verification.self']).toBe('Entered by me')
    expect(EN['profileHome.verification.coach_verified']).toBe('Confirmed by coach')
    expect(EN['profileHome.verification.performance_verified']).toBe('Confirmed by match results')
    expect(EN['card.provenance.self']).toMatch(/^Entered by me/)
    expect(EN['card.provenance.self']).toMatch(/no (match )?results yet/)
  })

  it('calls Career Passport "Playing history"', () => {
    expect(hits(EN, /Career|Passport|Timeline/)).toEqual([])
  })
})

describe('legal and consent wording is left as written', () => {
  it('keeps the privacy toggle name that the share messages point to', () => {
    expect(TH['profileEdit.privacy.toggle']).toBe('โปรไฟล์สาธารณะ')
    expect(TH['card.needPublicProfile']).toContain('โปรไฟล์สาธารณะ')
    expect(TH['profileEdit.privacy.minorWaiting']).toBe('นักกีฬาอายุต่ำกว่า 20 ปี เปิดสาธารณะได้หลังผู้ปกครองส่งคำขอเชื่อมบัญชี และคุณกดตอบรับที่หน้าผู้ปกครอง')
    expect(TH['impact.safety.consent.copy']).toBeTruthy()
  })
})
