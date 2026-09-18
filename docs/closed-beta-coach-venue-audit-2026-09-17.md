# Coach and venue-owner beta gate — 17 September 2026

Scope: controlled 5–20 user cohort. This audit does not establish production RLS
isolation or completion of a multi-account pilot. Start with five after the gates
below pass; expand after they finish their workflows.

## Evidence from this audit

- `npm test`: 354 tests passed in 32 files. Venue booking, cancellation,
  notifications, photo registration/preview/moderation and loading feedback have
  local coverage. Database boundaries are mocked or migration text is inspected;
  these tests do not execute deployed RLS or Storage policies.
- `npm run lint`: passed.
- `npm run build`: passed, 64/64 pages, in an isolated source copy excluding all
  `.env*` files and using CI placeholder Supabase values. Placeholder database DNS
  errors occurred during static generation; this is not a production-data test.
- Production public smoke: seven checks passed (home, athletes, ranking,
  tournaments, privacy, terms, and the expected 404).
- Additional signed-out HTTP checks: `/venues` and the selected venue detail
  returned 200; `/venue`, `/venues/bookings`, `/team-members`,
  `/dashboard/results` and `/notifications` returned 307 to login. These prove
  page-level routing only, not API/RLS isolation or browser hydration.
- `git diff --check`: passed before this report.
- `security:rls`: blocked before requests by missing shell configuration and
  PLAYER/ORGANIZER/ADMIN JWTs. No token values were read or requested in chat.
- `verify:production`: missing local shell variables. This does NOT prove that
  Vercel is misconfigured; production configuration remains unverified here.

No implementation bug fix, SQL apply, commit, push, or deployment was performed.
Existing changes in the runbook, SQL44 and its tests were preserved.

## Actual coach contract

SQL20 permits team creation for `onboarding_persona = coach_organizer` or an
organizer/admin role. Team management uses guarded roster RPCs. Match Plans use
`get_match_plan_safely` and `save_match_plan_safely`.

`app/api/match-results/route.ts` and `app/dashboard/results/page.tsx` require
organizer/admin; a non-admin organizer must own the tournament. The API also checks
accepted roster membership. A coach persona alone does not grant result recording
or verification privileges. Test denial for the coach and successful recording by
the tournament organizer; do not grant broad organizer permissions as a workaround.

## Prioritized remaining gates

1. **P0 — Prove authorization using distinct test accounts.** Supply session
   tokens securely in the execution environment for owner, requester/coach,
   unrelated adult, organizer and admin, plus known fixture IDs. Run positive and
   negative controls for bookings, notifications, roster, Match Plans, private
   athlete data and photo Storage. Verify unauthorized mutations are rejected,
   pending/hidden photos cannot receive a fresh public link, and public users
   cannot list the private bucket. Existing venue RLS harness covers 16 read checks
   only; it does not prove coach or Storage isolation. Existing signed links must
   be evaluated according to their lifetime, separately from fresh-link denial.
2. **P0 — Complete an end-to-end pilot on designated fixtures.** Venue: request,
   confirm, decline and requester cancellation on separate test cases; verify slot
   reopening, recipients of notifications, loading state and duplicate prevention.
   Photo: actual phone upload, owner preview, pending state, admin approval/hide,
   and visitor visibility. Coach: create team, invite, accept/decline, submit
   roster, save Match Plan; organizer records a match and participants verify
   Rating/XP/Badge/notification outcomes. No new authenticated pilot was completed
   in this audit.
3. **P1 — Repair verification and reconcile records.** The write-mode RLS script
   still expects direct admin PATCH of `player_ranks` to succeed, but SQL35 revokes
   authenticated table writes and requires audited RPCs. Correct that expectation
   with a regression test before enabling write checks. Several generic positive
   reads accept HTTP 200 even with no rows; add known-row controls. The current
   runbook marks SQL44 pending despite earlier reported application, and the older
   execution checklist excludes venues. Reconcile against production evidence;
   do not reapply migrations or overwrite another agent's pending edits.
4. **P1 — Operational sign-off.** Verify production distributed rate limiting,
   login for invited accounts, runtime error monitoring, a rollback target and a
   named support/moderation owner. Record five pilot completions before expanding
   to twenty. Local missing environment values alone are not evidence of a
   production outage.

## Next execution inputs

Use disposable adult accounts and designated TEST venues/tournament. Keep JWTs and
real account details out of git and chat. Start with the read-only authorization
matrix; use isolated fixtures for mutation checks. Database target is exclusively
`hivedzrwrrcnjrlirhtv`. Public page success and unit-test success cannot substitute
for these results.
