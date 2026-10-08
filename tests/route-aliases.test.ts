import { describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({ permanentRedirect: (to: string) => { throw new Error(`redirect ${to}`) } }))

// Chrome test, 8 Oct 2026: /onboarding and /parent were typed by hand and gave 404. They are the
// words people guess for /welcome and /guardian, so they lead there.
describe('guessed addresses', () => {
  it('/onboarding goes to /welcome', async () => {
    const { default: page } = await import('@/app/onboarding/page')
    expect(() => page()).toThrow('redirect /welcome')
  })
  it('/parent goes to /guardian', async () => {
    const { default: page } = await import('@/app/parent/page')
    expect(() => page()).toThrow('redirect /guardian')
  })
})
