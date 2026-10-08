import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/components/PageHeader', () => ({ default: () => null }))

import PrivacyPage from '@/app/privacy/page'
import TermsPage from '@/app/terms/page'

const text = (html: string) => html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ')

// Owner, 8 Oct 2026: a lawyer reviews these pages once the service grows; until then they must
// say what the system really does (checked against the code) and say plainly that no lawyer has
// reviewed them yet.
describe('/privacy says what the system really does', () => {
  const page = text(renderToStaticMarkup(createElement(PrivacyPage)))
  it('is labelled as a closed beta version not yet reviewed by a lawyer', () => {
    expect(page).toContain('ยังไม่ผ่านการตรวจของนักกฎหมาย')
  })
  it('explains guardian consent for athletes under 20 (MINOR_UNDER)', () => {
    expect(page).toContain('อายุต่ำกว่า 20 ปี')
    expect(page).toMatch(/ผู้ปกครอง.*ยินยอม/)
  })
  it('lists what others see on a public profile', () => {
    expect(page).toMatch(/ทุกคนเห็น/)
    expect(page).toContain('ไฮไลต์')
  })
  it('says data is stored and processed in Singapore', () => {
    expect(page).toContain('สิงคโปร์')
  })
  it('says athletes delete their own data from their profile page', () => {
    expect(page).toContain('ลบข้อมูลของฉัน')
  })
  it('keeps no English heading', () => {
    expect(page).not.toContain('Privacy Policy')
    expect(page).not.toContain('Consent')
  })
})

describe('/terms', () => {
  const page = text(renderToStaticMarkup(createElement(TermsPage)))
  it('warns that training programmes are not medical advice and children train with an adult', () => {
    expect(page).toContain('ไม่ใช่คำแนะนำทางการแพทย์')
    expect(page).toMatch(/ผู้ใหญ่/)
  })
  it('is labelled as not yet reviewed by a lawyer and has a Thai heading', () => {
    expect(page).toContain('ยังไม่ผ่านการตรวจของนักกฎหมาย')
    expect(page).not.toContain('Terms of Service')
  })
})
