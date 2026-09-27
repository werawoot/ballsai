# Supabase Auth OTP email — Thai and English

Supabase keeps **one** Magic Link template per project; it does not pick a template by
the user's language. So that people who do not read Thai can sign in (ADR-009), this
version carries both languages in one email: Thai first, English under each line. The
code, the flow and every constraint in `supabase-auth-email-otp.md` are unchanged.

Use this **instead of** `supabase-auth-email-otp.html` / `.txt`, not alongside them.

## Apply manually in Supabase

1. Confirm the target project ref before making any change. Try it on Staging
   (**`vorpnkedpscsqhnrssrl`**) first; Production (**`hivedzrwrrcnjrlirhtv`**) needs the
   owner's separate approval.
2. **Authentication → Email Templates → Magic Link**.
3. Subject: `รหัสเข้าสู่ BallDoenSai · Your BallDoenSai code: {{ .Token }}`
4. HTML body: the complete contents of `supabase-auth-email-otp-bilingual.html`.
5. Plain-text part, if offered: `supabase-auth-email-otp-bilingual.txt`.
6. Send a test only to an approved internal beta account and enter the code on `/login`.

## What differs from the Thai-only template

- Each Thai line has its English line under it, marked `lang="en"` so screen readers
  switch voice; the Thai lines are marked `lang="th"`.
- `{{ .Token }}` still appears in the preview line and the code card only.
- Still no `{{ .ConfirmationURL }}`, no expiry claim, no images, fonts or scripts.

## Not done

No Supabase setting has been changed, and no email has been sent. Per-language templates
(a Thai email for Thai users, an English one for others) would need the language stored
on the account and a custom email hook; that belongs with phase 4 of ADR-009.
