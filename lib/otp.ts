// Email one-time codes for /login. Supabase Auth sets the code length per project
// (MAILER_OTP_LENGTH, 6 to 10 digits; Staging sends 8), so the page accepts that range
// instead of promising a fixed count. See docs/research/supabase-email-otp-2026-09-29.md.

export const OTP_MIN_LENGTH = 6
export const OTP_MAX_LENGTH = 10
// Supabase's default wait between two code requests for one address.
export const OTP_RESEND_SECONDS = 60

export const normalizeOtp = (value: string) => value.replace(/\D/g, '').slice(0, OTP_MAX_LENGTH)
export const canSubmitOtp = (code: string) => code.length >= OTP_MIN_LENGTH && code.length <= OTP_MAX_LENGTH
export const normalizeEmail = (value: string) => value.trim().toLowerCase()

type AuthFailure = { code?: string; status?: number; message?: string }

// "expired": Supabase answers "Token has expired or is invalid" for a code that is past
// its lifetime, was already used (an email scanner opening a link in the message uses it
// too), or was replaced by a newer code sent to the same address.
// "captcha": Supabase refused the request because its Turnstile token was missing, used
// or expired (T19; docs/research/supabase-captcha-turnstile-2026-09-29.md).
export function otpErrorKey(error: AuthFailure): 'expired' | 'rateLimited' | 'captcha' | 'failed' {
  const message = error.message ?? ''
  if (error.code === 'captcha_failed' || /captcha/i.test(message)) return 'captcha'
  if (error.code === 'otp_expired' || /expired or is invalid/i.test(message)) return 'expired'
  if (error.code === 'over_email_send_rate_limit' || error.status === 429 || /security purposes|rate limit/i.test(message)) return 'rateLimited'
  return 'failed'
}

export function resendWaitSeconds(sentAt: number | null, now: number, period = OTP_RESEND_SECONDS) {
  if (sentAt === null) return 0
  return Math.max(0, Math.ceil((sentAt + period * 1000 - now) / 1000))
}
