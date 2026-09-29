import { describe, expect, it } from 'vitest'
import { captchaSiteKey, withCaptcha } from '@/lib/captcha'

// T19: a CAPTCHA before an OTP is requested. It stays off until the owner sets the
// Turnstile site key, so shipping the code changes nothing on its own.
describe('captcha switch', () => {
  it('is off without a site key, or with a blank one', () => {
    expect(captchaSiteKey(undefined)).toBeNull()
    expect(captchaSiteKey('')).toBeNull()
    expect(captchaSiteKey('   ')).toBeNull()
  })

  it('is on with a site key, trimmed', () => {
    expect(captchaSiteKey(' 0x4AAAAAAAabc ')).toBe('0x4AAAAAAAabc')
  })
})

describe('auth options with a captcha token', () => {
  it('adds the token only when there is one, keeping the other options', () => {
    expect(withCaptcha({ emailRedirectTo: 'https://x/cb' }, null)).toEqual({ emailRedirectTo: 'https://x/cb' })
    expect(withCaptcha({ emailRedirectTo: 'https://x/cb' }, 'tok')).toEqual({ emailRedirectTo: 'https://x/cb', captchaToken: 'tok' })
    expect(withCaptcha(undefined, 'tok')).toEqual({ captchaToken: 'tok' })
    expect(withCaptcha(undefined, null)).toBeUndefined()
  })
})
