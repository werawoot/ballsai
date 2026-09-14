# Supabase Auth and RLS research — Closed Beta

Research date: 2 September 2026. Scope: official Supabase guidance only; this note
does not change the Supabase project, email settings, redirects, or production data.

## Decision for the 5–20 person cohort

**Do not invite external testers until custom SMTP and the Auth URL allow-list have
been confirmed.** Run the existing real-session RLS smoke test before the first
organizer and athlete handle private data.

## 1. Email OTP / Magic Link delivery

- Supabase's built-in SMTP is for exploration, not production: it sends only to
  pre-authorized project-team addresses, has no delivery SLA, and is currently limited
  to two messages per project per hour (limits may change). That cannot support a
  5–20 person external beta reliably. [Custom SMTP guide](https://supabase.com/docs/guides/auth/auth-smtp)
- Configure a verified custom SMTP sender in Supabase Auth before external invitations.
  After custom SMTP is configured, Supabase initially limits Auth emails to 30 per
  hour; the operator should confirm the configured rate limit is sufficient for the
  invite window. [Custom SMTP guide](https://supabase.com/docs/guides/auth/auth-smtp)
  [Production checklist](https://supabase.com/docs/guides/deployment/going-into-prod)
- Keep the current code-entry OTP experience and `{{ .Token }}` template variable.
  The SMTP and rate-limit settings are an operator-owned, external gate; do not put
  SMTP credentials in the repository or frontend.

**Beta check:** use one approved internal address first, then release invitations in
small batches. Record send time, delivery, code verification, and any rate-limit error;
do not record OTPs or session links.

## 2. Auth redirect URLs

- The Supabase **Site URL** is the default destination when code does not supply
  `redirectTo`; Supabase calls it critical for email confirmations and password resets.
  It must be the real production URL, not a localhost URL. [Redirect URLs guide](https://supabase.com/docs/guides/auth/redirect-urls)
- Every `redirectTo` used by passwordless or social login must exactly match a value in
  Supabase's Redirect URLs allow-list. Use exact production URLs; documented wildcards
  are appropriate only for local development or controlled preview deployments.
  [Redirect URLs guide](https://supabase.com/docs/guides/auth/redirect-urls)
- If a future email-link template must honor a `redirectTo` destination, Supabase
  documents `{{ .RedirectTo }}` rather than `{{ .SiteURL }}`. This is not needed for
  the current code-entry OTP template, which intentionally does not provide a link.
  [Redirect URLs guide](https://supabase.com/docs/guides/auth/redirect-urls)

**Beta check:** before inviting anyone, the operator should compare the exact production
URL and every intentional callback route with Supabase Authentication → URL
Configuration. Test Google, Facebook, and Email OTP separately with approved accounts.

## 3. RLS evidence expected before beta

- Supabase requires both least-privilege database grants and RLS policies. An exposed
  table without RLS can be read or written by roles that have grants; policies alone do
  not remove grants. [RLS guide](https://supabase.com/docs/guides/database/postgres/row-level-security)
- Their recommended test shape asserts both allow and deny behavior for `select`,
  `insert`, `update`, and `delete`, across anonymous and authenticated contexts.
  [RLS guide](https://supabase.com/docs/guides/database/postgres/row-level-security)
  [Testing overview](https://supabase.com/docs/guides/local-development/testing/overview)
- JWTs determine the database role and user identity used by RLS. Authorization data
  must not rely on user-editable `user_metadata`; claims can also remain stale until a
  JWT refresh. [JWT guide](https://supabase.com/docs/guides/auth/jwts)
  [RLS guide](https://supabase.com/docs/guides/database/postgres/row-level-security)
- A publishable/anon key may be used by the frontend only with correct RLS; a service
  role or secret key bypasses RLS and must never reach frontend code. [Secure data guide](https://supabase.com/docs/guides/database/secure-data)

**Beta check:** run `npm run security:rls` in safe mode with real, separate athlete A,
athlete B, organizer, and admin sessions. Evidence must show: athlete A cannot read or
modify athlete B's private data; organizers are restricted to their own tournaments and
teams; anonymous access to a private payment slip is denied; and each role can perform
only its intended allowed action. Keep JWTs out of chat, git, logs, and screenshots.

## Operator checklist

- [ ] Confirm verified custom SMTP, sender identity, and Auth-email rate limit.
- [ ] Confirm production Site URL plus exact Redirect URLs for production callbacks.
- [ ] Test Google, Facebook, and code-entry Email OTP with approved beta accounts.
- [ ] Run and retain the safe-mode real-JWT RLS result; no write tests outside a
      disposable tournament and explicit approval.

