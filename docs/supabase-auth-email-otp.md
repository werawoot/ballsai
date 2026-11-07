# Supabase Auth OTP email — Closed Beta

> **Current template (7 Nov 2026): [`email/doensai-otp.html`](email/doensai-otp.html)** with the
> plain-text part [`email/doensai-otp.txt`](email/doensai-otp.txt). It carries the DOENSAI.com
> brand and the light glass colours of ADR-014, Thai first with a short English part (Supabase
> sends one template to every user), no digit count and no link. Subject for both **Magic Link**
> and **Confirm signup**: `รหัสเข้าสู่ DOENSAI ของคุณ`, with no code in it (owner, 7 Nov 2026: the code would show on a locked phone, and many users are minors who share a phone). The files named below
> (`supabase-auth-email-otp*`) are the older BallDoenSai version, kept for the record.

The athlete login page calls Supabase `signInWithOtp()` and verifies the entered code
with `verifyOtp({ type: 'email' })`. Supabase controls this email in its dashboard;
there is no repository-side template or application email to edit. The files alongside
this guide preserve the current OTP flow and require no code, deployment, or database
change.

## Apply manually in Supabase

1. Confirm the target project ref before making any change: Staging
   **`vorpnkedpscsqhnrssrl`** first, Production **`hivedzrwrrcnjrlirhtv`** only after Staging passes.
2. Go to **Authentication → Email Templates → Magic Link**. Supabase uses this template
   for the email sent by `signInWithOtp()`.
3. Set the subject to: `รหัสเข้าสู่ DOENSAI ของคุณ` (no code in the subject).
4. Copy the complete contents of `email/doensai-otp.html` into the HTML body, then
   save in the dashboard.
5. The Supabase dashboard takes the HTML body only, so `email/doensai-otp.txt` is a
   reference copy of the same words; use it only if a text part can ever be set. Do not
   paste the text version into the HTML field.
6. Repeat steps 3–5 for **Authentication → Email Templates → Confirm signup**. A
   first-time address gets that template from `signInWithOtp()`, not Magic Link; if it
   still holds the default link-only body, a new athlete receives no code, and a mail
   scanner opening the link would use the token up
   ([research](research/supabase-email-otp-2026-09-29.md)).
7. Preview the template in Supabase if available. Send a test only with an approved
   internal beta account, then enter the received code on `/login` to confirm the OTP
   flow still works.

## Template behavior and constraints

- `{{ .Token }}` is the Supabase Auth OTP variable. It appears once, in the HTML body;
  neither the subject nor the hidden preview line repeats it, so a locked phone does not show it.
- The visual system is the light glass of ADR-014: navy `#0B1220` text, green `#16E06E`
  only as the code border and the logo letter on navy, dark green `#0F7A3F` for text, grey
  `#475569` for secondary text (7:1 or better on white and on the page colour). System
  fonts only, because email clients do not reliably load web fonts.
- The template intentionally does **not** include `{{ .ConfirmationURL }}`. Login already
  asks the user to enter the code in the app; adding a magic-link CTA would create a
  second, untested path.
- It makes no expiry claim. Supabase's configured OTP lifetime remains the source of
  truth, while the footer tells recipients that the code is time-limited.
- It uses table layout and inline CSS only; there are no external images, web fonts,
  scripts, media queries, or remote assets. This keeps the email legible in common
  mobile and privacy-restricted clients.
- The code card is the primary action: large, high contrast, selectable, and readable
  without an image. The companion `.txt` file is the fallback for text-only clients.

## Not changed by this work

No Supabase dashboard setting, SMTP configuration, Auth provider, redirect URL,
production variable, login code, email delivery, or real email has been changed. The
operator remains responsible for applying the template and recording a real-account
test in the closed-beta checklist.
