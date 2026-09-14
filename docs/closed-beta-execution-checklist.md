# Closed Beta execution checklist

Goal: safely start a controlled 5–20 person BallDoenSai Closed Beta. This is a
release gate, not a feature wish-list. Every checked item needs recorded evidence.

## Scope for the first cohort

- [ ] One internal admin, one organizer/coach, three athletes and one guardian have
  named test accounts.
- [ ] One disposable tournament and two test teams are selected.
- [ ] The cohort uses Athlete, Organizer/Coach, Guardian and Admin flows only.
- [ ] Venue, Academy, Sponsor, BDS match rewards and Talent Explorer are outside the
  first release gate unless separately tested.

## Worktree and release integrity

- [x] `npm run lint` passes (23 August 2026).
- [x] `npm run build` passes (23 August 2026). The prior non-fatal
  `public_tournaments_fetch_failed` warning is now diagnostic: this workspace could not
  resolve the Supabase hostname (`ENOTFOUND`) during static generation. It is a local
  network/DNS limitation, not a reproduced query or RLS failure. A separate browser
  smoke check loaded `/`, `/athletes`, `/ranking`, `/tournaments`, `/privacy`, `/terms`
  and the 404 route successfully on both local and current production deployments.
- [x] `git diff --check` passes (23 August 2026).
- [x] Applied SQL16 was restored to its original history; its additional hardening is
  isolated in new pending SQL36. Other pending migrations remain separate numbered files.
- [ ] The intended release files are reviewed and committed as one release candidate.
- [ ] A deployment rollback target is identified before release.

## Production database — operator approval required

Target project must be `hivedzrwrrcnjrlirhtv`.

- [x] Read-only schema audit recorded baseline evidence on 23 August 2026 (no data
  or configuration changed): `team_members`, `notifications`, `guardian_links`,
  `match_plans`, `bds_wallets` and `delete_my_athlete_data()` exist. `data_disputes`
  and `admin_audit_logs` do not yet exist, confirming SQL31/SQL35 are still pending.
  The expected Data Trust and Admin summary functions are likewise absent. This query
  cannot by itself prove a numbered migration history; it proves the release-gate
  objects that must exist or remain absent.
- [x] SQL31 Data Trust was reviewed and applied to `hivedzrwrrcnjrlirhtv` on 23 August
  2026. A read-only check confirmed all six Data Trust tables, the dispute/event-view
  RPCs and `data_disputes` RLS. Cross-account behavior still needs real-JWT testing.
- [x] SQL35 Admin Audit was reviewed and applied to `hivedzrwrrcnjrlirhtv` on 23 August
  2026 after SQL31. A read-only check confirmed `admin_audit_logs`, its RLS policy and
  every audited Ranking, Hall of Fame and Trust-resolution RPC.
- [ ] SQL36 is reviewed and applied after SQL16 and SQL33 to harden the PDPA deletion
  RPC without rewriting SQL16 history.
- [ ] SQL30 and SQL32 remain unapplied until BDS match reward and void-reversal rules
  are explicitly approved and tested.
- [ ] The `slips` Storage bucket is private; raw object access is denied and the signed
  viewer route works for an authorized user only.
- [ ] RLS verification is run with distinct player, organizer and admin JWTs. Write
  checks run only against the disposable tournament.

### Schema-audit conclusion

**No-go yet.** The existing roster, guardian, notification, Match Plan and BDS Wallet
foundation is present, but the first Closed Beta gate still requires: SQL36 review and
apply, distinct-role RLS tests and the full pilot flow. SQL30/SQL32 remain deliberately
excluded.

Payment-slip follow-up: the `slips` bucket is private. On 23 August 2026, SQL37 removed
the four historic URL-format references after its count guard passed; read-only evidence
confirmed zero remaining URL-format values. The deployed viewer rejects future legacy
URLs rather than redirecting them. This gate still needs an authorized/signed-out/
expired-link test using a disposable new private slip.

SQL31 was hardened in the worktree on 23 August 2026 before review: its privileged
functions now use an empty `search_path` and reference database objects explicitly.
Its verification-event policy was also corrected so a data subject can read their own
event even if an organizer or admin was the actor. It was applied after review on 23
August 2026; the remaining SQL31 gate is a real-JWT RLS review.

## External configuration — operator action required

Use the operator-facing evidence and exact Auth/RLS checks in
[Supabase Auth and RLS research](supabase-closed-beta-auth-rls-research-2026-09-02.md)
before checking any item below.

- [ ] Rotate any Resend or Vercel credentials that appeared in screenshots or chat.
- [ ] Configure Vercel production variables, then run `npm run verify:production` in
  that production environment. The local command alone is not evidence because it does
  not load production variables.
- [x] Custom SMTP sender and Email OTP were operator-tested on 2 September 2026.
  Preserve the sender/domain evidence outside git; do not record credentials here.
- [ ] Configure Upstash Redis for distributed rate limits.
- [ ] Confirm `NEXT_PUBLIC_SHOW_DEMO_DATA` is not `true` in the release environment.
- [x] Production app URL and redirect URL
  `https://ballsai-teal.vercel.app/auth/callback` were operator-confirmed on 2 September
  2026.
- [x] Google, Facebook and Email OTP login were operator-confirmed on 2 September 2026.
- [ ] Ensure backup/PITR, deployment rollback and runtime-error monitoring are enabled.

## Multi-account pilot script

Use [the account roster](closed-beta-test-accounts.csv) and the detailed
[six-account pilot script](closed-beta-pilot-script.md). Keep the roster out of git
after real email addresses are entered.

- [ ] New athlete logs in, completes onboarding and creates a Player Card.
- [ ] Minor public-profile publishing fails without birth date and guardian consent.
- [ ] Organizer creates a team and invites an existing athlete account.
- [ ] Athlete accepts and declines invitations in separate test cases.
- [ ] Organizer submits the accepted roster to the disposable tournament.
- [ ] A phone uploads a valid payment slip; unauthorized accounts cannot read it.
- [ ] Organizer confirms payment and team status.
- [ ] Coach saves a Match Plan using accepted roster members only.
- [ ] Organizer records a result. Rating, XP, Badge, Career, Ranking and Notification
  are independently checked on the correct accounts.
- [ ] An isolated result is voided. Rating and identity effects reverse according to
  the approved rules; no manual database correction is needed.
- [ ] Highlight reporting, moderation and account-deletion requests are exercised with
  disposable accounts.
- [ ] Admin Audit shows audited Ranking/Hall/Trust activity after SQL35.

## Go / no-go

Start with five testers only when every item below is true:

- [ ] No cross-account data access in the RLS test.
- [ ] No unprotected payment slip access.
- [ ] The complete tournament-to-identity flow passes without developer intervention.
- [ ] Email login works with the configured sender.
- [ ] Admin can investigate, moderate, roll back a bad result and handle a deletion
  request through documented procedures.
- [ ] A human support and PDPA owner are named.
- [ ] No unresolved severity-1 or severity-2 defect remains for 48 hours after the
  final pilot run.

Do not call the public launch or million-user capacity ready on the basis of this
checklist. Those are later gates requiring load, recovery and operational testing.
