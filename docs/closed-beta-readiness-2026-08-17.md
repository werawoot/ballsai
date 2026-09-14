# Closed Beta Readiness — 17 August 2026

## Decision now: NO-GO for invitations

The repository supports the intended closed-beta journey, but the journey has not yet
been proved with real accounts, the target Supabase project, storage, or a deployed
production environment. Do not invite the 5–20 testers until the **blocking gates**
below are all checked by the operator.

This assessment is deliberately evidence-based. “Implemented” means the relevant code
and migration exist in this worktree; it does not mean the external dependency is
configured, applied, or has succeeded with a real user.

## Evidence collected in this review

| Area | Evidence in repository | Status | What is still needed |
| --- | --- | --- | --- |
| Auth and onboarding | Login/onboarding routes documented; Google and Email OTP are configured outside the repo | Needs real-account test | Test Google, Facebook, and OTP independently with beta accounts. Verify a first login reaches `/welcome` and the next login does not. |
| Athlete identity and safeguarding | Guardian-consent UI and database migration are present; public profile rules are documented | Needs real-account + DB test | Use a minor account: publishing without birth date/consent must fail both through UI and direct authenticated request. Confirm public profile has no phone/contact data. |
| Team roster | `team_members`, guarded invite/respond RPCs, UI and API routes are present | Needs migration + 3-role test | Apply step 19 after confirming project ref, then organizer invites an existing athlete account; athlete accepts/declines; organizer can see the roster. |
| Tournament and payment | Guarded registration/payment-confirmation RPCs, upload validation, private-slip signed-URL route are present | Needs real mobile/storage test | Create a throwaway beta tournament; register two teams; upload a <=5 MB JPG/PNG/WEBP from a phone; verify owner/organizer/admin access and signed-out denial. |
| Match result → rating/identity | `record_match_result_safely`, void path, XP/badge triggers and ranking invalidation are present | Needs real data test | Confirm two teams, record one result and verify `match_results`, performance rows, rating events, XP, badge and `/ranking`; then exercise void in an isolated test. |
| Notifications | Migration 17 and `/notifications` UI are present | Needs migration + real-event test | Confirm team invite, team status, new match result and newly earned badge appear only for the correct account. |
| RLS / least privilege | Existing RLS smoke script covers core roles; migration 19 removes two privilege escalations found in review | Blocked pending step 19 + JWTs | Run safe RLS script with player/organizer/admin JWTs and a dedicated roster privilege check. |
| Monitoring / operations | Structured logging, `/admin/operations`, config verification and public smoke scripts exist | Blocked | The production config checker confirms `RESEND_FROM_EMAIL` is missing. Check Vercel runtime logs, private bucket status, mail sender, distributed rate limit and support owner. |
| Automated verification | `npm run lint` passed; script syntax checks passed; production-environment build generated all 35 routes | Passed (code/build) | This verifies the build only, not external database state, real-role flows, storage access, or RLS behavior. |

## Blocking gates before the first invitation

1. In Supabase, verify the URL/project ref is **`hivedzrwrrcnjrlirhtv`**, then apply the
   documented migrations through **step 19**. Do not run `supabase-rls-private-slips.sql`
   or `sample-data.sql`.
2. Create `slips`, make it private, and prove raw unsigned object access is rejected.
3. Set exactly one beta organizer and one internal admin role; create only a scoped,
   disposable beta tournament for write/void checks.
4. Add all Google beta users as OAuth test users while Google is in Testing mode; verify
   Facebook and Email OTP separately. OAuth/dashboard changes are operator actions.
5. Set the missing production `RESEND_FROM_EMAIL` to a verified sender, confirm demo
   data is disabled and Upstash is configured, then re-run `npm run verify:production`
   in the production environment.
6. Run `npm run lint`, `npm run build`, and the public smoke test after dependencies are
   installed and against the deployed beta URL. The 17 August production-environment
   build and public smoke check passed; repeat after any release affecting the pilot.
7. Run `npm run security:rls` in safe mode with real player, organizer and admin JWTs.
8. Complete the five-person W1 script in `docs/closed-beta-runbook.md` §6. A match must
   change rating, XP, badge and ranking without developer intervention.
9. Name the human support/PDPA owner and test the reporting, moderation and account
   deletion runbooks only with disposable test accounts.

## Explicit external/operator actions

These cannot be proven or changed from this code review: Supabase migration and bucket
state; account roles; Google/Facebook OAuth dashboard state; Vercel/Resend/Upstash
variables; deployment/runtime logs; real-mail delivery; real-phone uploads; real JWTs;
and test-account creation. They require an authorized operator and must be recorded in
the W1 checklist.

## Local command results (17 August)

- `npm run lint`: **PASS**.
- `node --check scripts/*.mjs`: **PASS**.
- `git diff --check`: **PASS**.
- `npm run build`: **PASS** when run through Vercel's production environment; compiled,
  type-checked and generated all 35 routes without exposing environment values. A plain
  local build still lacks the public Supabase variables, by design.
- `npm run verify:production`: ran through the Vercel production environment and
  **FAILED only because `RESEND_FROM_EMAIL` is missing**. The other required variables
  were present. No values were displayed.
- `npm run security:rls`: **not runnable yet**; it needs configured Supabase values and
  player, organizer and admin JWTs.
- `npm ci`: completed. The dependency audit reports 9 transitive vulnerabilities
  (1 low, 8 high); triage the exact advisories before public launch, and do not run an
  automatic breaking upgrade during the pilot.

## Recommended pilot progression

Start with 5 people: 1 organizer, 3 athletes and 1 guardian, plus an internal admin.
Use two confirmed teams in one disposable tournament. Expand toward 20 only after every
W1 pass criterion succeeds and no production blocker appears for the agreed observation
period.

## Follow-up evidence (14 September 2026)

- Venue-owner close-slot slice: **local PASS**. The guarded API has four regression
  cases (unauthenticated, owner success, active-booking conflict and non-owner denial).
- Full `npm test`, `npm run lint`, `npm run build` and `git diff --check`: **PASS**.
  The local browser loaded `/venues` with the expected styled empty state, no console
  warning/error, and `/venue` correctly redirected an unauthenticated visitor to login.
- SQL38 remains **unapplied**. The close-slot button must not be deployed until
  `sql/38-close-venue-slot-v1.sql` is explicitly approved, applied to project
  `hivedzrwrrcnjrlirhtv`, and its privilege/behavior post-check passes.
- `npm audit --omit=dev` reports **3 production dependency findings** (2 high,
  1 critical) involving Next.js/PostCSS and `ws`. Do not use the suggested forced major
  upgrade. Triage and test a controlled framework/security update before inviting the
  pilot group.
