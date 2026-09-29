import { describe, expect, it } from 'vitest'
import { OTP_MAX_LENGTH, OTP_MIN_LENGTH, canSubmitOtp, normalizeEmail, normalizeOtp, otpErrorKey, resendWaitSeconds } from '@/lib/otp'

// T16: the login page said "6 digits" while Staging sends 8, and showed Supabase's raw
// English error. The code length is a project setting (Auth: MAILER_OTP_LENGTH), so the
// page accepts any length Supabase allows and names the real reasons a code is refused
// (docs/research/supabase-email-otp-2026-09-29.md).
describe('email one-time code', () => {
  it('accepts the lengths Supabase can be set to, digits only', () => {
    expect([OTP_MIN_LENGTH, OTP_MAX_LENGTH]).toEqual([6, 10])
    expect(normalizeOtp(' 1234 5678 ')).toBe('12345678')
    expect(normalizeOtp('12-34-56')).toBe('123456')
    expect(normalizeOtp('1234567890123')).toBe('1234567890')
    expect(canSubmitOtp('12345')).toBe(false)
    expect(canSubmitOtp('123456')).toBe(true)
    expect(canSubmitOtp('12345678')).toBe(true)
    expect(canSubmitOtp('1234567890')).toBe(true)
  })

  it('sends and verifies the same address, however it was typed', () => {
    expect(normalizeEmail('  Somchai@Example.COM ')).toBe('somchai@example.com')
  })

  it('names why a code was refused', () => {
    expect(otpErrorKey({ code: 'otp_expired', message: 'Token has expired or is invalid' })).toBe('expired')
    expect(otpErrorKey({ message: 'Token has expired or is invalid' })).toBe('expired')
    expect(otpErrorKey({ code: 'over_email_send_rate_limit', message: 'x' })).toBe('rateLimited')
    expect(otpErrorKey({ status: 429, message: 'x' })).toBe('rateLimited')
    expect(otpErrorKey({ message: 'For security purposes, you can only request this after 42 seconds.' })).toBe('rateLimited')
    expect(otpErrorKey({ message: 'something else' })).toBe('failed')
  })

  // T19: with CAPTCHA on, Supabase refuses a request without a valid Turnstile token with
  // 400 captcha_failed (docs/research/supabase-captcha-turnstile-2026-09-29.md). The page
  // must say so, not show the generic send failure.
  it('recognises a CAPTCHA refusal', () => {
    expect(otpErrorKey({ code: 'captcha_failed', status: 400, message: 'captcha protection: request disallowed (no captcha_token found)' })).toBe('captcha')
    expect(otpErrorKey({ status: 400, message: 'captcha protection: request disallowed (timeout-or-duplicate)' })).toBe('captcha')
    expect(otpErrorKey({ status: 500, message: 'captcha verification process failed' })).toBe('captcha')
  })

  it('counts down to the next allowed resend', () => {
    const sentAt = 1_000_000
    expect(resendWaitSeconds(sentAt, sentAt)).toBe(60)
    expect(resendWaitSeconds(sentAt, sentAt + 59_001)).toBe(1)
    expect(resendWaitSeconds(sentAt, sentAt + 60_000)).toBe(0)
    expect(resendWaitSeconds(null, sentAt)).toBe(0)
  })
})
