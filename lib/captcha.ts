// T19. Cloudflare Turnstile in front of Supabase Auth requests that send email or check
// a password. Off until NEXT_PUBLIC_TURNSTILE_SITE_KEY is set, so the widget ships before
// the owner turns CAPTCHA on in Supabase (which rejects any request without a token).

export function captchaSiteKey(value: string | undefined = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY) {
  const key = value?.trim()
  return key ? key : null
}

// Supabase Auth reads the token from options.captchaToken; adding it only when there is
// one keeps requests identical to today's while the CAPTCHA is off.
export function withCaptcha<T extends object>(options: T | undefined, token: string | null): (T & { captchaToken?: string }) | undefined {
  if (!token) return options
  return { ...(options ?? ({} as T)), captchaToken: token }
}
