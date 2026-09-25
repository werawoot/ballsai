import { afterEach, describe, expect, it, vi } from 'vitest'
import { sendTeamStatusEmail } from '@/lib/email'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('sendTeamStatusEmail', () => {
  const email = { teamName: 'Test Team', tournamentName: 'Test Cup', email: 'test@example.com', status: 'confirmed' as const }

  it('reports unknown delivery when the network fails after the status update', async () => {
    vi.stubEnv('RESEND_API_KEY', 'test-only')
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('network lost')))

    expect(await sendTeamStatusEmail(email)).toEqual({ sent: false, reason: 'EMAIL_NETWORK_OUTCOME_UNKNOWN' })
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('preserves the provider response on HTTP failure', async () => {
    vi.stubEnv('RESEND_API_KEY', 'test-only')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, text: async () => 'provider rejected' }))

    expect(await sendTeamStatusEmail(email)).toEqual({ sent: false, reason: 'provider rejected' })
  })
})
