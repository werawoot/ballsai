import { createElement, type ComponentType } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { NextIntlClientProvider } from 'next-intl'
import { describe, expect, it, vi } from 'vitest'
import th from '@/messages/th.json'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {}, push: () => {}, replace: () => {} }), usePathname: () => '/profile/edit' }))
vi.mock('@/lib/supabase', () => ({ createClient: () => ({}) }))

import EditProfileForm from '@/app/profile/EditProfileForm'

// Chrome test, 8 Oct 2026: a birth date in 2026 was saved and /profile said "อายุ 0 ปี".
const render = (birthDate: string) => renderToStaticMarkup(createElement(NextIntlClientProvider as ComponentType<never>, { locale: 'th', messages: th, timeZone: 'Asia/Bangkok' } as never,
  createElement(EditProfileForm, {
    profile: null,
    athleteProfile: { display_name: 'ปลาย', birth_date: birthDate, is_public: false, verification_level: 'self' },
    videos: [], achievements: [], highlights: [], userId: 'u1',
  })))
const text = (html: string) => html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ')

describe('birth date on /profile/edit', () => {
  it('a birth date that gives age 0 shows what is wrong, not "อายุ 0 ปี"', () => {
    const page = text(render(`${new Date().getFullYear()}-01-01`))
    expect(page).not.toContain('อายุ 0 ปี')
    expect(page).toContain(th.profileEdit.messages.birthDateRange)
  })
  it('a 12-year-old sees their age and no warning', () => {
    const year = new Date().getFullYear() - 13
    const page = text(render(`${year}-01-01`))
    expect(page).toMatch(/อายุ 1[23] ปี/)
    expect(page).not.toContain(th.profileEdit.messages.birthDateRange)
  })
})
