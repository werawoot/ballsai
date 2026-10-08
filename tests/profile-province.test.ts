import { createElement, type ComponentType } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { NextIntlClientProvider } from 'next-intl'
import { describe, expect, it, vi } from 'vitest'
import th from '@/messages/th.json'
import { THAI_PROVINCES, canonicalProvince } from '@/lib/thai-provinces'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {}, push: () => {}, replace: () => {} }), usePathname: () => '/profile/edit' }))
vi.mock('@/lib/supabase', () => ({ createClient: () => ({}) }))

import EditProfileForm from '@/app/profile/EditProfileForm'

// Chrome test, 8 Oct 2026: the province was free text, so "แแแแ" was saved and shown.
describe('province', () => {
  it('is one of the 77 provinces, with Bangkok as typed by hand counted as Bangkok', () => {
    expect(THAI_PROVINCES).toHaveLength(77)
    expect(canonicalProvince('เชียงใหม่')).toBe('เชียงใหม่')
    expect(canonicalProvince(' กทม. ')).toBe('กรุงเทพมหานคร')
    expect(canonicalProvince('แแแแ')).toBeNull()
    expect(canonicalProvince('')).toBeNull()
  })

  const render = (province: string) => renderToStaticMarkup(createElement(NextIntlClientProvider as ComponentType<never>, { locale: 'th', messages: th, timeZone: 'Asia/Bangkok' } as never,
    createElement(EditProfileForm, {
      profile: null,
      athleteProfile: { display_name: 'ปลาย', birth_date: '2013-01-01', province, is_public: false, verification_level: 'self' },
      videos: [], achievements: [], highlights: [], userId: 'u1',
    })))
  const provinceSelect = (html: string) => html.match(/<select[^>]*id="pf-province"[\s\S]*?<\/select>/)?.[0] ?? ''

  it('/profile/edit picks it from a list of all 77, not a text box', () => {
    const select = provinceSelect(render('เชียงใหม่'))
    expect((select.match(/<option/g) ?? []).length).toBe(78)
    expect(select).toMatch(/<option value="เชียงใหม่" selected="">/)
  })
  it('a value that is not a province is not kept: the list asks for a choice', () => {
    const html = render('แแแแ')
    expect(provinceSelect(html)).toMatch(/<option value="" selected="">/)
    expect(html).not.toContain('แแแแ')
  })
})
