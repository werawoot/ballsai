# Supabase Auth OTP email — Closed Beta

The athlete login page calls Supabase `signInWithOtp()` and verifies the entered code
with `verifyOtp({ type: 'email' })`. Supabase controls this email in its dashboard;
there is no repository-side template or application email to edit. The files alongside
this guide preserve the current OTP flow and require no code, deployment, or database
change.

## Apply manually in Supabase

1. Confirm the target project is **`hivedzrwrrcnjrlirhtv`** before making any change.
2. Go to **Authentication → Email Templates → Magic Link**. Supabase uses this template
   for the email sent by `signInWithOtp()`.
3. Set the subject to: `รหัสเข้าสู่ BallDoenSai: {{ .Token }}`.
4. Copy the complete contents of `supabase-auth-email-otp.html` into the HTML body, then
   save in the dashboard.
5. If the dashboard or SMTP provider supports a text part, use the complete contents of
   `supabase-auth-email-otp.txt` as the plain-text alternative. Do not paste the text
   version into the HTML field.
6. Preview the template in Supabase if available. Send a test only with an approved
   internal beta account, then enter the received code on `/login` to confirm the OTP
   flow still works.

## Template behavior and constraints

- `{{ .Token }}` is the Supabase Auth OTP variable. Keep both occurrences unchanged.
- The visual system mirrors the existing login UI: deep navy `#080f1e`, action red
  `#ef2028`, and athlete-pride gold `#f5c518`. The email uses system fonts rather than
  the web fonts used by the site, because email clients do not reliably load them.
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
