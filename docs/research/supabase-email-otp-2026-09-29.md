# Why a correct email code can be refused (T15/T16) — 29 Sep 2026

Question: on Staging (27 Sep) a full 8-digit email code was refused several times, and
`/login` said "6 digits". What can make Supabase refuse a code the user typed correctly,
and what should the page say?

Sources are primary: the Supabase docs source and the Supabase Auth server source on
GitHub (supabase.com itself is blocked from this environment, so the same pages were read
from the docs repository).

## Findings

1. **The code length is a project setting, 6 to 10 digits.** Auth reads
   `MAILER_OTP_LENGTH` and falls back to 6 when it is unset or outside 6–10.
   Staging sends 8, so "6 digits" was simply wrong for that project.
   — `supabase/auth` `internal/conf/configuration.go` (`MailerConfiguration.OtpLength`;
   `if config.Mailer.OtpLength == 0 || config.Mailer.OtpLength < 6 || config.Mailer.OtpLength > 10 { … = 6 }`), commit `ce9a8eee0cc0`.

2. **One code per address; a new request replaces the old one.** Sending a code stores
   its hash in the user's `confirmation_token` (new user) or `recovery_token` (existing
   user), overwriting what was there. Verifying type `email` checks those two columns
   only. So after a second request, the first email's code is refused.
   — `supabase/auth` `internal/api/mail.go` (`user.RecoveryToken = hashedToken`,
   `user.ConfirmationToken = hashedToken`) and `internal/api/verify.go`
   (`case mail.EmailOTPVerification:` checks `ConfirmationToken`, then `RecoveryToken`).

3. **Every refusal reads the same.** Expired, already used, or replaced: Auth answers
   `403 otp_expired` "Token has expired or is invalid". The user cannot tell which.
   — `internal/api/verify.go` (`isOtpValid` returns false when expired or when the hash
   differs; the error is `ErrorCodeOTPExpired`, "Token has expired or is invalid").

4. **A link in the same email can use the code up before the user types it.** Mail
   security scanners (e.g. Microsoft Defender Safe Links) open links in incoming mail;
   opening `{{ .ConfirmationURL }}` consumes the token, and the typed code then fails
   with "Token has expired or is invalid". Supabase's advice is to send the code
   (`{{ .Token }}`) instead of a link.
   — Supabase docs, "Email Templates → Limitations → Email prefetching",
   `apps/docs/content/guides/auth/auth-email-templates.mdx`, commit `3f205627e018`.

5. **Resend limit and lifetime are project settings.** By default one code per address per
   `auth.rate_limits.otp.period`, valid for `auth.rate_limits.otp.validity`; the lifetime
   is "Email OTP expiration" in the dashboard (`MAILER_OTP_EXP`).
   — `apps/docs/content/guides/auth/auth-email-passwordless.mdx`, "With OTP".

## What changed in the app (T16)

- `/login` no longer names a digit count: it accepts 6–10 digits (`lib/otp.ts`).
- The code screen says only the newest email's code works, and offers "send a new code"
  after a 60-second wait for that address.
- "Token has expired or is invalid" becomes a Thai/English sentence naming the three
  causes; a rate-limit answer says to wait. Raw Supabase messages are no longer shown.
- The address is trimmed and lower-cased for both the request and the check.

## What the owner still has to check (T15, needs the Supabase dashboard)

On Staging (`vorpnkedpscsqhnrssrl`), for one refused attempt:

1. **Auth logs**: filter by the test address around the attempt time.
   - Two or more `/otp` requests before the failing `/verify` → finding 2 (an older code
     was typed). The new screen now says so.
   - A `/verify` (GET, link) from an unfamiliar IP or user agent between the `/otp` and
     the user's attempt → finding 4 (a scanner used the link).
   - The `/verify` long after the `/otp` → expired; compare with "Email OTP expiration".
2. **Email templates**: both **Magic Link** (existing users) and **Confirm signup** (a
   first-time address gets this one) must contain `{{ .Token }}` and must **not** contain
   `{{ .ConfirmationURL }}`. `docs/supabase-auth-email-otp.md` covers Magic Link only;
   apply the same body to Confirm signup.
3. **Email OTP length**: note the configured value (8 on Staging). The page now accepts
   any length Supabase allows.

T16's acceptance ("5 successful logins in a row") is a manual test on Staging after
these checks; it is not proven by this change.
