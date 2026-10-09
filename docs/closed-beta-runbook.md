# BallDoenSai.com Closed Beta Runbook

Use this checklist before inviting real organizers and athletes. Closed beta runs on
real database data only — never on the demo fallback.

Document status: updated **17 August 2026**, verified against the SQL files and
route handlers in this repository.

Reading order: `README.md` first (vision, status, routes), then this runbook
(operations). Section 6 is the W1 pilot script and is written in Thai because the
testers read it directly.

---

## 1. Production Environment

Set these values in Vercel or the production host:

```bash
NEXT_PUBLIC_SUPABASE_URL=<production_supabase_url>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<production_supabase_anon_key>
NEXT_PUBLIC_SHOW_DEMO_DATA=false
RESEND_API_KEY=<resend_api_key>
RESEND_FROM_EMAIL=BallDoenSai.com <verified-sender@your-domain.com>
UPSTASH_REDIS_REST_URL=<upstash_redis_rest_url>
UPSTASH_REDIS_REST_TOKEN=<upstash_redis_rest_token>

# Optional. Defaults to football / 2026.
NEXT_PUBLIC_ACTIVE_SPORT=football
NEXT_PUBLIC_ACTIVE_SEASON=2026
```

Notes:

- `NEXT_PUBLIC_ACTIVE_SPORT` and `NEXT_PUBLIC_ACTIVE_SEASON` define the competition
  window every ranking, result and card query uses (`lib/season.ts`). They are build-time
  public values, so rolling into a new season means setting the variable and
  redeploying. Leave them unset during W1 to keep the current window.

- Demo data appears **only** when `NEXT_PUBLIC_SHOW_DEMO_DATA` is exactly `true`
  (`lib/sample-data.ts`). Leaving it unset behaves like `false`. Setting it
  explicitly to `false` is still recommended so the intent is visible in Vercel.
- Without `RESEND_API_KEY` / `RESEND_FROM_EMAIL`, team confirm/reject email is
  skipped silently and logged as `team_status_email_failed`. The team status in the
  database still changes.
- Without the Upstash pair, rate limiting falls back to per-instance memory, which
  does not hold across Vercel instances. Acceptable for local development only.
- Google OAuth client ID/secret live in the Supabase Auth provider dashboard, never
  in these variables and never in the repository.
- `npm run verify:production` fails unless all six variables above are present and
  demo data is not `true`. Run it with the production values loaded in the shell.

---

## 2. Confirm The Target Supabase Project

Every SQL statement below must run against project ref **`hivedzrwrrcnjrlirhtv`**
(`Ballsai`). Before opening the SQL editor, confirm the project ref in the Supabase
URL matches, and that it matches `NEXT_PUBLIC_SUPABASE_URL` in production.

Do not apply any of these files to another project. Do not edit production rows by
hand in the dashboard — schema changes go into a new migration file in `sql/`.

---

## 3. Apply Supabase SQL

Apply in this exact order from the Supabase SQL editor. The order matters: the
identity triggers depend on tables created by earlier files, and
`production-hardening.sql` must run last because it tightens the storage policy that
the base RLS file leaves permissive.

| # | File | Purpose | Depends on |
| ---: | --- | --- | --- |
| 1 | `sql/check-duplicates-before-unique-indexes.sql` | Reports rows that would break the unique indexes | — |
| 2 | *(manual)* | Fix any duplicate rows the check reported | — |
| 3 | `sql/supabase-rls.sql` | Base RLS, `is_admin()` / `is_organizer()`, core indexes | — |
| 4 | `sql/fix-profile-auth-trigger.sql` | `handle_new_user()` trigger + backfill so every auth user has a `profiles` row | 3 |
| 5 | `sql/ballsai-rating-v1.sql` | `player_ratings`, `match_results`, `match_player_performances`, `rating_events` | 3 |
| 6 | `sql/athlete-profile-v2.sql` | `athlete_profiles`, videos, achievements, skill assessments, `athlete-avatars` bucket | 3 |
| 7 | `sql/link-player-ranks-to-profiles.sql` | `player_ranks.player_id` FK to `profiles` + unique index per player/sport/season | 3, 6 |
| 8 | `sql/digital-identity-v1.sql` | `athlete_progress`, `athlete_xp_events`, `athlete_badges`, XP/badge trigger on `rating_events`, one-time backfill | 5, 6 |
| 9 | `sql/digital-identity-v2-hall.sql` | `rookie` badge, badge→achievement sync, `hall_of_fame_entries` | 8 |
| 10 | `sql/athlete-highlight-uploads-v1.sql` | `athlete_highlights` + private `athlete-highlights` bucket and policies | 6 |
| 11 | `sql/onboarding-v1.sql` | `profiles.onboarding_persona / _sport / _goal / _completed_at` | 3 |
| 12 | `sql/production-hardening.sql` | Makes `slips` private, replaces the public slip read policy, adds `register_team_safely`, `confirm_payment_safely`, `record_match_result_safely`, discovery indexes | 3, 5 |
| 13 | `sql/match-result-void-v1.sql` | `void_match_result_safely()` so a mistyped result can be reversed together with its rating, XP and badges | 9, 12 |
| 14 | `sql/guardian-consent-enforcement-v1.sql` | Blocks a public athlete profile without a birth date, and a minor's public profile without guardian consent, at the database level | 6 |
| 15 | `sql/highlight-moderation-v1.sql` | Report queue, hide/unhide state for uploaded highlights, and storage reads that follow the hidden state | 10 |
| 16 | `sql/data-deletion-v1.sql` | `delete_my_athlete_data()` for PDPA requests, plus the `account_deletion_requests` queue an admin closes by hand | 9, 15 |
| 17 | `sql/17-notifications-v1.sql` | In-app notifications for confirmed match results, newly earned badges, and team status changes; owner-only RLS | 8, 9, 12 |
| 18 | `sql/18-team-members-v1.sql` | Team membership invites for existing accounts, response flow, and `team_invite` notifications | 17, 3 |
| 19 | `sql/19-notification-team-member-privilege-hardening-v1.sql` | Restricts notification creation and acknowledgement; routes roster changes only through guarded RPCs | 17, 18 |
| 20 | `sql/20-tournament-roster-flow-v1.sql` | Tournament-only draft roster: invite/accept before registration, payment guard, and accepted-roster-only match performances | 18, 19, 12 |
| 21 | `sql/21-guardian-links-v1.sql` | Guardian↔athlete consented account links, private progress access, and database-enforced minor publishing rule | 14, 17, 8 |
| 22 | `sql/22-guardian-consent-trigger-v1.sql` | Ensures the guardian-link publishing function is invoked on public-profile changes | 21, 14 |
| 23 | `sql/23-venues-and-bookings-v1.sql` | Venue-owner profiles, one-off court slots, guarded booking requests and owner decisions | 22, 3 |
| 24 | `sql/24-venue-owner-onboarding-v1.sql` | Permits `venue_owner` and `manage_venue` in onboarding constraints | 23, 11 |
| 25 | `sql/25-scout-shortlists-v1.sql` | Private Scout shortlist for public athlete profiles only | 24, 6 |
| 26 | `sql/26-organizations-v1.sql` | Academy, club and school organizations, member invitations and organization teams | 25, 3 |
| 27 | `sql/27-sponsor-brand-opportunities-v1.sql` | Sponsor/Brand public opportunities and athlete-initiated interest, without direct contact data | 26, 13 |
| 28 | `sql/28-match-plans-v1.sql` | Private pre-match Match Plan for team manager/organizer/admin; accepted roster only, no result or identity changes | 20 |
| 29 | `sql/29-bds-wallet-v1.sql` | Internal BDS Wallet ledger and guarded admin awards; no crypto or transfer | 3 |
| 30 | `sql/30-bds-match-rewards-v1.sql` | **Pending review:** automatic match rewards; do not apply until void/reversal behavior is approved | 29, 12 |
| 31 | `sql/31-data-trust-foundation-v1.sql` | **Applied 23 August 2026:** provenance, evidence metadata, verification history, disputes, anomaly queue and safe rank explanations; all six tables, three RPCs and `data_disputes` RLS were read-only verified | 5, 6, 8, 12, 29 |
| 32 | `sql/32-bds-void-reversal-v1.sql` | **Pending review:** reverses recoverable BDS from a voided rating event and creates an admin hold for any unrecovered balance | 29, 30, 31, 13 |
| 33 | `sql/33-data-deletion-function-privilege-hardening-v1.sql` | **Applied 22 August 2026:** removes Supabase's direct default EXECUTE grants from `anon` / `service_role`; keeps the self-service deletion RPC authenticated-only | 16 |
| 34 | `sql/34-admin-command-center-performance-v1.sql` | **Applied 22 August 2026:** server-side athlete search index, partial queue indexes and one guarded Admin Command Center summary RPC | 15, 16, 17, 21, 23, 26, 27, 33, core schema |
| 35 | `sql/35-admin-audit-log-v1.sql` | **Applied 23 August 2026:** append-only Admin Audit Trail, admin-only read access, atomic audited Ranking/Hall of Fame mutations and audited Trust resolutions; table, RLS and all audited RPCs were read-only verified | 31, 34, `digital-identity-v2-hall.sql`, core schema |
| 36 | `sql/36-data-deletion-search-path-hardening-v1.sql` | **Pending review:** moves the empty `search_path` hardening for the PDPA deletion RPC into a new migration without rewriting applied SQL16 | 16, 33 |
| 37 | `sql/37-quarantine-legacy-payment-slip-links-v1.sql` | **Applied 23 August 2026:** removes exactly four historic URL-format slip references after checking the expected count; does not delete Storage objects | 13, `payments` |
| 38 | `sql/38-close-venue-slot-v1.sql` | **Applied 14 September 2026:** lets a venue owner close an unbooked open slot; refuses slots with pending or confirmed bookings, and records an admin override in the SQL35 audit trail. Function and effective privileges were read-only verified. | 23, 33, 35, 39 |
| 39 | `sql/39-venue-rpc-privilege-hardening-v1.sql` | **Applied 14 September 2026:** removes unintended direct `anon` and `service_role` EXECUTE grants from the six SQL23 venue RPCs; all six were read-only verified as `anon = false`, `service_role = false`, `authenticated = true`. | 23 |
| 40 | `sql/40-venue-slot-booking-state-v1.sql` | **Applied 15 September 2026:** separates booking-reserved slots from owner-blocked slots, snapshots booking display data, hides active bookings from public availability, and atomically reopens declined/cancelled slots. Post-check verified five non-null snapshot columns, no open/reserved slot inconsistencies, no missing snapshots, all four RPCs are `SECURITY DEFINER` with empty `search_path`, authenticated-only execution, and no requester slot policy. | 23, 38, 39 |
| 41 | `sql/41-venue-booking-notifications-v1.sql` | **On Production, found present by the 8 Oct 2026 status check (`sql/checks/apply-round-status.sql`, step 2); function fingerprints notify_venue_booking_requested b6f8e200 (notify_venue_booking_responded carries SQL54's body) matched the repo and anon cannot execute; not re-run.** **Pending review — do not apply yet:** in-app notifications for the venue booking flow via two triggers on `venue_booking_requests`; adds the `venue_booking` notification type, notifies the owner on request and cancellation and the requester on confirm and decline, carries no requester identity, purpose, note or contact number, and de-duplicates on the SQL17 unique `source_key`. Redefines no applied RPC. | 17, 19, 21, 23, 40 |
| 42 | `sql/42-notification-privilege-hardening-v1.sql` | **On Production, found present by the 8 Oct 2026 status check (`sql/checks/apply-round-status.sql`, step 1); not re-run.** **Pending review — do not apply yet:** repairs notification privileges observed on production: browsers cannot execute `create_notification` or insert/update notification data directly; authenticated users retain RLS-protected reads and `read_at` acknowledgements only. Sets an empty `search_path` on the applied helper without redefining its body. | 17, 19 |
| 43 | `sql/43-venue-photos-v1.sql` | **Applied 17 September 2026:** private venue-photo bucket, pending-by-default moderation, owner/admin-only object access, public metadata only for visible photos of published venues, and five authenticated-only guarded RPCs. Signed-media delivery is handled separately by the application; objects remain private. | 23, 35 |
| 44 | `sql/44-venue-photo-storage-policy-fix-v1.sql` | **On Production, found present by the 8 Oct 2026 status check (`sql/checks/apply-round-status.sql`, step 3); not re-run.** **Pending review — do not apply yet:** repairs SQL43's three owner policies on `storage.objects` (insert, read, delete). In each, the unqualified `name` inside the `venue_profiles` subquery resolved to the venue's name, so a venue owner could not upload, preview or delete their own photos (reproduced on a sandbox Postgres 28 Sep 2026; admins unaffected). Every policy now uses `storage.objects.name`. Its self-check reads the deparsed policy text, `foldername(objects.name)`; the first draft checked for `storage.objects.name`, which Postgres never stores, and would have rolled itself back on every apply. Makes no bucket, object, photo-row, or grant change. Run its precheck (expect three policies still bound to `v.name`) and postcheck, then upload, preview and delete one photo with a real venue-owner account. | 43 |
| 45 | `sql/45-venue-photo-public-delivery-v1.sql` | **Applied 17 September 2026:** adds one narrow anonymous `SELECT` policy on `storage.objects` so a visitor can be issued a short-lived signed URL for a venue photo whose row is `visible` and whose venue is published. Postcheck confirmed the `venue-photos` bucket is still **private**, that the only anonymous venue-photo policy is `venue_photos_public_object_read` for `{anon,authenticated}`, and that its predicate opens nothing beyond `moderation_status = 'visible'` on a published venue — `pending` and `hidden` photos stay non-public, as do photos of an unpublished venue. Bucket listing is blocked through the documented `storage.allow_any_operation(...)` helper plus an exact object-depth check. Granted nothing to `anon` at table or function level and changed no SQL43 policy. Re-run `sql/45-venue-photo-public-delivery-postcheck.sql` (read-only) to re-verify, and scope its anonymous-policy check to `policyname like 'venue_photos%'`: `athlete_avatars_public_read` and `athlete_highlights_owner_or_public_profile_read` are pre-existing policies of other features, so counting every anon policy on `storage.objects` returns more than one and says nothing about SQL45. | 43 |
| 46 | `sql/46-venue-beta-operations-v1.sql` | **On Production, found present by the 8 Oct 2026 status check (`sql/checks/apply-round-status.sql`, step 5); function fingerprints coordinate_venue_booking_beta fdafa06f matched the repo and anon cannot execute; not re-run.** **Applied on Staging 24 Sep 2026 with the service_role revoke from commit 700c6a9 (branch `codex/sql46-staging-privilege-fix`), which reached main only on 4 Oct 2026, after Production refused the older text: Supabase grants a new table to service_role, so revoking from anon and authenticated alone fails the file's own privilege check and rolls back. The file now equals what Staging ran.** Pending Production: venue-owner edits, weekly slots, overlap protection, private booking coordination, and consent-based reschedule/cancellation. Requires a reviewed precheck for exactly one GiST UUID operator class, existing overlaps, and lock risk; run its postcheck after any approved application. | 23, 40, 41, 42 |
| 47 | `sql/47-coach-beta-management-v1.sql` | **On Production, found present by the 8 Oct 2026 status check (`sql/checks/apply-round-status.sql`, step 6); function fingerprints manage_coach_beta 99c697e3 matched the repo and anon cannot execute; not re-run.** **Pending review — do not apply:** creator-scoped roster removal and athlete-consented, field-level coach verification for playing position. Extends the PDPA deletion path only when the deployed deletion function exactly matches its reviewed fingerprint; run its precheck and postcheck around any approved application. | 16, 18, 20, 31, 33, 36 |
| 48 | *(reserved)* | Uncommitted guardian work in another checkout; see ADR-010. | — |
| 49 | *(reserved)* | Roster merge of SQL20 and beta SQL24/25 under ADR-010 (W1 rules 1A/2A/3A); not written yet — waits for the Staging/Production inventory. Never apply SQL20 or beta SQL24 directly. | 20, beta 24/25 |
| 50 | `sql/50-anon-definer-execute-revoke-v1.sql` | **Applied on Production 8 Oct 2026, owner approved ("อนุมัติลง SQL51 52 53 59 50 57 58 62 Production"), pasted by the owner in the SQL Editor; precheck: runs as postgres, 41 functions to revoke, no other owner, no anon/public RLS policy calls a non-allowlisted definer function; result Success (Run without RLS for the temp table); postcheck anon can call only the five allowlisted functions, public defaults postgres/authenticated/service_role X with no anon, signed-in save_tournament_fixtures_safely still executable; signed out, /, /tournaments, /ranking and /athletes loaded.** **Pending review — do not apply yet:** revokes anon and PUBLIC EXECUTE from every SECURITY DEFINER function in `public` and `audit` (extension functions excluded) except `is_admin()`, `is_organizer()`, `is_accepted_guardian_for(uuid)`, `confirm_guardian_verification(text)` and `revoke_guardian_consent(text,text)`, which anonymous requests need (RLS on public pages; guardian email links). Changes only functions owned by `postgres` (every function our migrations create): a REVOKE removes only the running role's grants, and Supabase's defaults also give anon EXECUTE on functions `supabase_admin` creates in `public`. Any such definer function is named in a `SQL50 left unchanged, owned by another role` notice and needs a separate decision. Re-grants any EXECUTE that `authenticated` or `service_role` lose, so signed-in behaviour is unchanged, and stops new functions from being anon-executable by default (global PUBLIC/anon revoke plus the `in schema public` anon revoke; authenticated keeps its default). Must run as `postgres`. Its self-check rolls everything back on any leftover anon grant, any lost signed-in grant, or a default that still exposes a new function. Verified on a sandbox Postgres 16 with Supabase-style defaults. Run its precheck, then the postcheck, then the manual signed-out/signed-in checks it lists. | none |
| 51 | `sql/51-public-list-pagination-indexes-v1.sql` | **Applied on Production 8 Oct 2026, owner approved ("อนุมัติลง SQL51 52 53 59 50 57 58 62 Production"), pasted by the owner in the SQL Editor; precheck: 0 venues, 4 tournaments, names free; result Success; postcheck both indexes valid.** **Pending review — do not apply yet:** adds `venue_profiles_published_page_idx` on `venue_profiles (created_at desc, id) where is_published` and `tournaments_start_date_page_idx` on `tournaments (start_date, id)`, the exact order `/venues` and `/tournaments` page by (T07/T08). Without them every page sorts the whole table. Plain `CREATE INDEX` blocks writes to the table while it builds; the precheck shows row counts, and above tens of thousands of rows build with `CREATE INDEX CONCURRENTLY` instead. Self-check rolls back unless both indexes exist and are valid. On a sandbox with 50,000 venues and 100,000 tournaments, page 50 went from Seq Scan + Sort (23.5 ms / 26.4 ms) to Index Only Scan (0.57 ms / 1.38 ms). | 23 |
| 52 | `sql/52-public-athlete-rankings-view-v1.sql` | **Applied on Production 8 Oct 2026, owner approved ("อนุมัติลง SQL51 52 53 59 50 57 58 62 Production"), pasted by the owner in the SQL Editor; precheck: PostgreSQL 15+, 28 columns, name free, anon reads player_ranks; result Success; postcheck security_invoker=true, anon select true, anon writes false.** **Pending review — do not apply yet:** adds the `public_athlete_rankings` view (`security_invoker = true`, SELECT only) joining `player_ranks`, public `athlete_profiles` and `player_ratings`, so the ดาวรุ่ง and MVP tabs on `/ranking` get the true top 50 from the database at any size (T09). It exposes an `under_18` flag, never a birth date, and lists only `is_public` profiles, even to a signed-in owner or admin. Needs Postgres 15+. Until it is applied the app logs `public_identity_ranking_view_missing` and uses the old 500-profile reads. Self-check rolls back unless the view is security_invoker, carries no profile column such as `birth_date`, and anon/authenticated can only SELECT. Sandbox with 100,000 athletes and repo RLS: anon sees exactly the 60,000 public ones; a private profile is absent even to its owner; top-50 matches a direct query; revoking anon's `athlete_profiles` SELECT makes the view refuse (caller rights); 78 ms / 160 ms per tab, and the app caches for 60 s. | athlete-profile-v2, ballsai-rating-v1 |
| 53 | `sql/53-athletes-directory-index-v1.sql` | **Applied on Production 8 Oct 2026, owner approved ("อนุมัติลง SQL51 52 53 59 50 57 58 62 Production"), pasted by the owner in the SQL Editor; precheck: 8 athlete_profiles rows, name free; result Success; postcheck index valid.** **Pending review — do not apply yet:** adds `athlete_profiles_directory_page_idx` on `athlete_profiles (sport, created_at desc, user_id) where is_public`, the order `/athletes` pages by (T45). Plain `CREATE INDEX` blocks writes to `athlete_profiles` while it builds; the precheck shows the row count, and above tens of thousands build it concurrently instead. Self-check rolls back unless the index exists and is valid. Sandbox with 100,000 profiles: page 2 unfiltered went from Parallel Seq Scan + Sort 25.6 ms to Index Only Scan 0.11 ms; with province and age filters 1.2 ms before, 2.7 ms after. | athlete-profile-v2 |
| 54 | `sql/54-venue-cancel-notification-fix-v1.sql` | **On Production, found present by the 8 Oct 2026 status check (`sql/checks/apply-round-status.sql`, step 7); function fingerprints notify_venue_booking_responded 56c17d2c matched the repo and anon cannot execute; not re-run.** **Pending review — do not apply yet:** replaces SQL41's `notify_venue_booking_responded()` so a cancellation notice names the right party. A pending request the requester withdraws still tells the owner "ผู้ขอยกเลิกคำขอจอง" with the same key; a confirmed booking cancelled by agreement through SQL46 tells the participant who did not perform the change (both, when an admin does it), with a key per recipient. Confirmed and declined notices are copied unchanged. Self-check rolls back unless the new body and trigger are in place and no client role can execute the function. Sandbox: SQL41's own function reproduced the bug (owner told "the requester cancelled" for an owner-accepted cancellation, requester told nothing); SQL54 fixed all three cases; re-run safe; a mutant without the revoke rolled back. Step 7 of [`docs/apply-round-2026-09.md`](apply-round-2026-09.md). | 41, 46 |
| 55 | `sql/55-tournament-fixtures-v1.sql` | **Applied: Staging (before 8 Oct 2026) and Production 8 Oct 2026, owner approved, pasted by the owner in the SQL Editor. Staging fingerprint of `save_tournament_fixtures_safely` 453f32e9 matched the repo, anon cannot execute. Production precheck true/true/true; result Success; postcheck rls on, authenticated select true / insert false, anon select false, authenticated save true, anon save false. Public reading still needs SQL50 then SQL57.** `tournament_fixtures` (one row per fixture of a draw made by `lib/fixtures.ts`: knockout, league, groups then knockout) and `save_tournament_fixtures_safely(uuid, jsonb)`, the only way to write it. Only the tournament's organizer or an admin may replace a draw; the tournament row is locked so concurrent requests leave one complete draw; a draw with any recorded result cannot be replaced; every team must be a confirmed team of that tournament; every `winner:` reference must name a fixture in the same draw. Clients can only SELECT, and RLS limits that to the organizer and admins. Self-check rolls back on RLS off, write grants, or wrong function grants. Sandbox: organizer save/replace, other organizer refused, admin allowed, pending or foreign team refused, bad reference refused, draw locked after a result, two simultaneous saves leave one complete draw, a mutant without the table revoke rolled back. Step 15 of [`docs/apply-round-2026-09.md`](apply-round-2026-09.md). | tournaments, teams, match_results |
| 56 | `sql/56-fixture-results-v1.sql` | **Applied: Staging (before 8 Oct 2026) and Production 8 Oct 2026, right after SQL55, owner approved, pasted by the owner. Staging fingerprints matched the repo (advance 386dc375, fill_group_places 3895de81, link_fixture_on_result 0c686b4a, unlink_fixture_on_void c7b156cb, set winner 069fb76e), anon cannot execute any. Production precheck true/true/false; result Success; postcheck link trigger true, unlink trigger true, organizer can pick winner true, client can advance false.** results move a draw on, inside the result's own transaction. An AFTER INSERT trigger on `match_results` links a confirmed result to the earliest open fixture with the same two teams (group, league, knockout; then round and key); a knockout winner fills every `winner:<key>` side; a completed group fills `group:<X>:1/2` by points, goal difference, goals, then registration order. A drawn knockout waits for `set_fixture_winner_safely` (organizer or admin). An AFTER UPDATE trigger on void unlinks the result and takes back what it advanced, and refuses the void with `FIXTURE_ALREADY_ADVANCED` when a later match already has a result. Every change locks the tournament row. Sides now keep their source after the team is filled. Self-check rolls back on a leftover either-or check, a missing trigger, or client-executable helpers. Sandbox: advances, reversed team order, penalties (other organizer refused, bad picks refused), void refused then allowed in order, friendly result ignored, group tiebreaks by GD, goals and registration order, simultaneous last group games, mutant without a revoke rolled back. Step 16 of [`docs/apply-round-2026-09.md`](apply-round-2026-09.md). | 55, match-result-void |
| 57 | `sql/57-public-fixtures-v1.sql` | **Applied on Production 8 Oct 2026, owner approved ("อนุมัติลง SQL51 52 53 59 50 57 58 62 Production"), pasted by the owner in the SQL Editor; after SQL50; precheck SQL56 and SQL50 present, name free; result Success; postcheck anon can read, anon cannot publish.** **Pending review — do not apply yet; apply AFTER SQL50:** `tournaments.fixtures_published_at` (every draw starts private), `set_fixtures_published_safely(uuid, boolean)` (organizer or admin, row locked) and `public_tournament_fixtures(uuid)`, a definer reader granted to anon on purpose that returns rows only for a published draw: team ids and names, sources, the confirmed score turned to home/away, the knockout winner and registration order. No team members, creators or profiles. SQL50 would take the anon grant away if it ran later, hence the order. Self-check rolls back unless anon can read and cannot publish, and no tournament is already published. Sandbox: private draw returns nothing to anon; another organizer and anon cannot publish; published draw readable with scores the right way round; teams and fixtures tables still closed to anon; unpublish hides it again; a mutant without the anon grant rolled back. Step 18 of [`docs/apply-round-2026-09.md`](apply-round-2026-09.md). | 56, 50 |
| 58 | `sql/58-athlete-private-columns-v1.sql` | **Applied on Production 8 Oct 2026, owner approved ("อนุมัติลง SQL51 52 53 59 50 57 58 62 Production"), pasted by the owner in the SQL Editor; after SQL50, 52, 53; precheck names free, anon could read birth_date, no other view or invoker function reads the columns; result Success; postcheck anon and authenticated cannot select birth_date, anon can select display_name, athlete can update birth_date, anon can execute public_athlete_age.** **Pending review — do not apply yet; apply AFTER SQL50, SQL52 and SQL53:** closes T50. anon and authenticated lose SELECT on `athlete_profiles.birth_date` and `guardian_consent_at` and keep every other column (the grant list is read from the live table; a column added later needs its own grant). INSERT and UPDATE are unchanged, so athletes still save their birth date (the app now uses a plain insert or update: an upsert reads EXCLUDED and would need SELECT). `public_athlete_age(uuid)` gives the age, Bangkok date, of a public profile, the caller's own, or any for an admin; `my_athlete_private()` gives the caller alone their birth date and consent time. New view `public_athlete_directory` (security_invoker, public only, age instead of birth date) for `/athletes`; `public_athlete_rankings` recreated with SQL52's columns, `under_18` now from the age function; `player_ranks_emerging_idx` keeps the ดาวรุ่ง tab fast. Self-check, signed out included, rolls back on any leftover read of the two columns, lost read of another column, or wrong function grant. Sandbox (Postgres 16, Supabase-like roles): anon and signed-in users refused both columns and a birth-date filter; directory and rankings still readable signed out with correct ages; owner reads own and saves by update and insert; a mutant without the table-wide revoke rolled back; 100,000 public athletes: directory page 2–3 ms, ดาวรุ่ง 6 ms with the index (1.2 s without). The app works before and after it is applied. Step 19 of [`docs/apply-round-2026-09.md`](apply-round-2026-09.md). | 50, 52, 53 |
| 59 | `sql/59-ranking-provinces-view-v1.sql` | **Applied on Production 8 Oct 2026, owner approved ("อนุมัติลง SQL51 52 53 59 50 57 58 62 Production"), pasted by the owner in the SQL Editor; precheck: name free, anon reads player_ranks, 0 ranks; result Success; postcheck view exists, anon select true.** **Pending review — do not apply yet:** closes T10. `public_ranking_provinces` (security_invoker, SELECT only): one row per sport, season and stored province with a count of ranked athletes, plus `player_ranks_sport_season_province_idx`. The `/ranking` province filter used to read every `player_ranks` row of the season, which PostgREST cuts at 1000, so provinces silently went missing past 1000 ranked athletes. Until it is applied the app offers all 77 provinces instead of reading the table. Creates no function, so its place relative to SQL50 does not matter. Self-check, signed out included, rolls back on a wrong view, grant or index. Sandbox, 100,000 ranks: 4 rows back in 22 ms; a mutant without the grant rolled back. Step 13 of [`docs/apply-round-2026-09.md`](apply-round-2026-09.md). | supabase-rls |
| 60 | `sql/60-match-result-request-id-v1.sql` | **Applied: Staging (before 8 Oct 2026) and Production 8 Oct 2026, owner approved, pasted by the owner in the SQL Editor. Precheck true/true; result Success; postcheck authenticated true, anon false, clients read submissions false; fingerprint 329fbca10c97ceea368ee9e439495ce1, the same on both. Applied BEFORE SQL50 as required:** found writing T14. `record_match_result_safely` stops most repeats only because the first call moves every rating (RATING_CHANGED); a plain draw between equally rated teams moves none (1000 vs 1000, draw, no stats: change 0), so a retried or double-clicked confirm recorded the match twice, with XP and matches_played twice. Adds `match_result_submissions` (RLS on, no policy, no client grant) and `record_match_result_once(request id, …)`, which claims the request id before recording and returns the first result on any repeat, concurrent or not; another account reusing an id gets REQUEST_ID_TAKEN; a failed recording leaves no request row. The form mints one id per preview; the app falls back to the old function until this is applied. Precheck lists likely duplicates already recorded. Sandbox: five concurrent calls with one id → one row, five identical answers; the same against a mutant without the key → five rows; anon cannot call; clients cannot read the table. Step 14 of [`docs/apply-round-2026-09.md`](apply-round-2026-09.md). | production-hardening |
| 61 | `sql/61-first-match-rank-v1.sql` | **Applied: Staging (before 8 Oct 2026) and Production 8 Oct 2026, right after SQL60, owner approved, pasted by the owner. Precheck sql60 true, unique index true, name free true; skill columns and position were already nullable (all YES), so a rollback restores no NOT NULL; result Success; postcheck function true, authenticated true, anon false, not-null skill columns 0; fingerprint 2692ffe29055904a0d2ed652aa0d03e9, the same on both:** T32. An athlete's rank row is created by their first verified match instead of by an admin. `record_match_result_first_rank(request id, match, performances, sport, season)` accepts `athleteId` items, checks the organizer/admin rule first, then requires an accepted roster member of that team with a **public** profile (a rank row is readable by anyone; the consent trigger governs public profiles), creates the rank and rating rows (`on conflict do nothing`) and records through `record_match_result_once` in the same transaction, so a failed recording leaves no rank row. PAC/SHO/PAS/DRI/DEF and position become nullable; a match-created row leaves the skills NULL (not assessed). Sandbox (real `record_match_result_safely` + SQL60): anon cannot call; another organizer, a private athlete, a pending member, a member of the other team and a duplicate are refused and write nothing; a stale rating rolls back the new row; success creates the rows with empty skills and leaves assessed stats untouched; a repeat returns the same match; two concurrent matches create one rank row (the second gets RATING_CHANGED); removing the public check fails the private-athlete scenario. Apply, second apply refused, rollback, second rollback refused, re-apply: all pass. **Fixed before any apply (30 Sep):** the unique index `player_ranks_player_sport_season_idx` is partial (`where player_id is not null`), so the conflict target must repeat that predicate; the first version did not and, reproduced against the real index, failed every first-match insert. All scenarios re-run against the partial index. Step 20 of [`docs/apply-round-2026-09.md`](apply-round-2026-09.md). | 60 |
| 62 | `sql/62-private-athlete-avatars-v1.sql` | **Applied on Production 8 Oct 2026, owner approved ("อนุมัติลง SQL51 52 53 59 50 57 58 62 Production"), pasted by the owner in the SQL Editor; precheck bucket public, storage helper present; result Success; postcheck bucket private, athlete_avatars_public_read gone, athlete_avatars_public_profile_sign present.** **Pending review — order-independent (no functions):** T51. `athlete-avatars` becomes private and `athlete_avatars_public_read` is dropped. The owner (own folder) and an admin keep every read; anyone else can only *sign* (`storage.allow_any_operation` `object.sign`/`object.sign_many`, so no listing or direct download) the one object a **public** profile's `profile_image_url` points at, stored as a path or as the older public URL. Private profiles, minors without consent (the consent trigger governs `is_public`) and replaced photos get no URL. The app (`lib/athlete-avatar.ts`) stores paths, signs a page's photos in one request for 1 hour, and removes every file in the athlete's folder on PDPA deletion; it works before and after this file. Sandbox (Postgres 16, Supabase storage helpers): before — anon could list and read all 5 test objects; after — anon signs only the 2 current public photos, lists nothing; the private minor sees own photo; an unrelated user signs only public photos; admin sees all. 100,000 profiles, 200,000 objects: signing 50 photos 3.3 ms (primary-key lookup per object). Postcheck: `anon_can_sign` 66,669 = public profiles with a photo, `anon_can_list` 0. Apply, second apply, rollback, second rollback refused, re-apply: all pass. Step 21 of [`docs/apply-round-2026-09.md`](apply-round-2026-09.md). | athlete-profile-v2 |
| 63 | `sql/63-training-v1.sql` | **Applied: Staging 3 Oct 2026, Production 4 Oct 2026 (with SQL64; fingerprint equal on all nine values). Order-independent (after athlete-profile-v2 and SQL21):** training feature ([`docs/training-flow-v1.md`](training-flow-v1.md)). Two tables: `training_enrollments` (athlete, programme, weekdays, start date, status) and `training_checkins` (one per enrollment per day). Only the athlete writes; an accepted guardian and an admin read; anon has no access. Only the four solo programmes in `training_self_start_programs()` can be started (the U16 hip-and-groin programme is coach-assigned and cannot); one active enrollment per programme, at most 3 active (advisory lock); a check-in only for an active enrollment and for today or the 6 days before (Thailand time); `program_id` and `athlete_id` cannot be updated. No pain answers and no XP are stored: match XP stays verified-only. PDPA deletion cascades from `athlete_profiles`. Sandbox (Postgres 16): duplicate start, coach-only programme, starting for someone else, a start date in the past, a 4th active programme, a duplicate check-in, a 10-day back-fill, a future date, changing the programme, B checking in on A's enrollment, a guardian writing and anon reading are all refused; two concurrent starts past the limit leave exactly 3; profile deletion leaves 0 rows. 100,000 athletes, 1.6 M check-ins: one athlete's enrollments 0.05 ms, last 10 weeks of check-ins 0.12 ms (index scans). Apply, second apply, rollback, second rollback refused, re-apply: all pass. Step 22 of [`docs/apply-round-2026-09.md`](apply-round-2026-09.md). | athlete-profile-v2, 21 |
| 64 | `sql/64-training-anon-execute-revoke-v1.sql` | **Applied: Production 4 Oct 2026 (not needed on Staging). Apply after SQL63:** SQL63 revoked EXECUTE on `training_self_start_programs()` and `training_today()` from PUBLIC only. Supabase grants EXECUTE on a new public function straight to anon until SQL50 changes the default privileges, so on Production (no SQL50 yet) anon could still call both. Found on 4 Oct 2026: Production's SQL63 fingerprint differed from Staging's only in `execute_rights`. Nothing leaked: neither function reads a table, and anon has no access to the training tables. This file revokes both from PUBLIC and anon, keeps authenticated, and checks all three training functions in-file. Sandbox (Postgres 16) with Supabase-like default privileges: before SQL63 refused; after SQL63 anon true/true; after SQL64 the fingerprint equals the full-file reference on all nine values; a second run and a run on a Staging-like database change nothing; anon calling `training_today()` is refused, authenticated still works. No rollback file: undoing it would only re-open anon access. Step 23 of [`docs/apply-round-2026-09.md`](apply-round-2026-09.md). | 63 |
| 65 | `sql/65-match-result-void-null-safe-v1.sql` | **Applied: Staging and Production 6 Oct 2026 (fingerprint cbc46e5b…, anon/service_role false, authenticated true). Supersedes `sql/match-result-void-v1.sql` (apply instead of it, or after it where it is already in):** the void RPC refused callers with `v_role not in ('organizer','admin') or (v_role <> 'admin' and v_organizer_id <> v_user_id)`. A comparison with NULL is NULL and `IF NULL` does not raise, so a signed-in user with no `profiles` row could void any match, and any organizer could void a match of a tournament without `organizer_id`. Found 4 Oct 2026 while reviewing the file before its Production apply (stopped). The function body is otherwise unchanged; EXECUTE is revoked from anon and service_role by name and checked in-file. Postgres 16: truth table old vs new (old lets 3 cases through, new refuses them, organizer-own and admin still allowed); apply twice on a database with Supabase-like default privileges: anon false, service_role false, authenticated true. Step 24 of [`docs/apply-round-2026-09.md`](apply-round-2026-09.md). | match-result-void prerequisites (production-hardening, digital-identity-v2-hall) |
| 66 | `sql/66-production-sample-data-cleanup-v1.sql` | **Production only, data not schema. Applied 7 Oct 2026 (owner approved) as two equivalent statements typed in the SQL Editor, because the file could not be pasted:** `delete from public.player_ranks where player_id is null and created_at::date = date '2026-03-01' and not exists (select 1 from public.match_results) returning player_name;` (10 rows) then `update public.tournaments set status = 'closed' where status = 'open' and created_at::date = date '2026-03-01' and start_date < date '2026-10-01' returning name;` (3 rows). Precheck 10 / 3 / 0 match results; postcheck 0 rank rows, 0 open tournaments. Removes the 1 Mar 2026 seed: made-up athletes on the public ranking (rule 5) and three past tournaments still open. The 11 seed teams stay, under closed tournaments. Every reference to `player_ranks` cascades or sets null. Do not run the file again. | — |
| 67 | `sql/67-production-test-data-cleanup-v1.sql` | **Production only, data not schema. Applied 8 Oct 2026 (owner approved) by hand in the SQL Editor, because the file cannot be pasted.** The first typed delete stopped on `payments_team_id_fkey` and rolled back with nothing deleted. A read-only check then listed every foreign key on these tables (only `payments` and `venue_booking_coordination` block a delete) and 4 payments (3 confirmed, 1 pending) on the test teams. The owner approved removing those too, and one `begin … commit` deleted, in order: coordination rows on the test bookings, the bookings, the venues, the payments of the test teams, the teams. Precheck 12 / 3 / 3 / 0 match results; result `Success`; postcheck 0 / 0 / 0 / 0. The file does the same, guarded. Slip images of those 4 payments stay in the private `slips` bucket, unreachable; remove them by hand if wanted. Removes test data that real testers would see: the 12 teams under the two seed tournaments SQL66 closed ("ดดดด", "fff", "hgggg" and others, plus one draft), the 3 published "TEST — Venue Flow" venues on `/venues` and the 3 "ซ้อมทีม" bookings on them. Courts, slots, photo rows, team members and match plans cascade. Precheck must read 12 teams / 3 venues / 3 bookings / 0 match results; postcheck 0 / 0 / 0. Do not run the file again. | 66 |
| 68 | `sql/68-match-plan-free-positions-v1.sql` | **Applied: Production and Staging 9 Oct 2026, pasted by the owner in the SQL Editor. Order, as it happened: the first apply, meant for Staging, ran on Production; the ref had been checked from a relayed message, not read from the screen. It was found when the Production precheck (after the owner's approval "อนุมัติลง SQL68 Production") already showed the columns; Settings › General then read Project ID `hivedzrwrrcnjrlirhtv`. Nothing was harmed: no plan rows existed (`plan_rows` 0) and the file was the sandbox-tested one. Production postcheck: columns and check true, anon false/false, authenticated true/true, fingerprints get `7261ce50`, save `a4bd216b`. Staging (`vorpnkedpscsqhnrssrl`) precheck then read columns false, so the file was applied there too: Success; postcheck identical, fingerprints `7261ce50` / `a4bd216b`. Lesson: read the Project ID from Settings › General before every run, not from the URL as reported by someone else. Apply after SQL28 (present on Production since the 23 Aug 2026 audit).** The coach's pitch board on `/match-plan` lets a starter be dragged anywhere on the pitch. Adds nullable `pos_x`/`pos_y` (smallint, whole percent 0–100; both or neither; starters only, by table check and in the RPC) to `match_plan_players`; `save_match_plan_safely` stores them and `get_match_plan_safely` returns them. Every SQL28 rule is unchanged (who may save, accepted roster only, 25 players, no repeats, team lock). EXECUTE revoked from PUBLIC and anon by name and checked in-file. The app works before the file (the old function ignores the extra keys, the board shows formation spots) and after (dragged points stay on every device). Precheck `sql28 true`, columns and check false. Postcheck columns and check true, anon false, authenticated true, fingerprints get `7261ce50`, save `a4bd216b` (Postgres 16 sandbox). Sandbox (Postgres 16, Supabase-like roles and default privileges): save with points and read back; old-style save still works; only one coordinate, outside 0–100, a substitute with a point, an invited athlete, another user and anon are refused; a failed save leaves the last good plan; a direct insert breaking the rule is refused by the table check; without SQL28 the file stops and changes nothing; a mutant without the substitute rule lets that case through (so the scenario catches it); apply, second apply, rollback (`sql/68-match-plan-free-positions-down.sql`), second rollback refused, re-apply: all pass. | 28 |

Before applying step 41, run `sql/41-venue-booking-notifications-precheck.sql` against
project `hivedzrwrrcnjrlirhtv` and record every result set. It is read-only and
authorises nothing. It confirms SQL17/SQL23/SQL40 are in place, records the current
`notification_type` constraint and the per-type row counts as the rollback baseline,
proves every `venue_profiles.owner_id` has an `auth.users` row (the notification insert
would otherwise roll a real booking back), and proves neither trigger function exists
yet. After application, run `sql/41-venue-booking-notifications-postcheck.sql`.

SQL41 notifications are created only by triggers. A notification failure rolls the whole
booking transaction back: that is deliberate for closed beta, where a silently missing
notification is worse than a visible failure. Rollback is `drop trigger` plus
`drop function` for the two trigger functions; **leave the widened
`notification_type` constraint in place**. Narrowing it again requires first accounting
for every `venue_booking` row already written, or the `add constraint` will fail
validation.

The `search_path` and privilege repair for the applied `public.create_notification` is
deliberately NOT part of SQL41. It is SQL42, a separate migration; SQL17 and SQL19 must
not be edited. SQL41 precheck must not proceed to application until SQL42 postcheck has
confirmed browser EXECUTE and direct notification writes are absent.

Before applying step 40, run `sql/40-venue-slot-booking-state-precheck.sql` against
project `hivedzrwrrcnjrlirhtv` and record every result set. It checks the exact status
constraint, partial live-booking index, RLS posture, current policies and RPC grants,
the owner-blocked baseline, aggregate open slots to backfill, and whether every historic
booking can be snapshotted. It exposes no requester, venue or booking identifiers. A
passing precheck is necessary but is not approval to apply. The application must first
be deployed with the backward-compatible booking-history reader; only then may a
separately approved SQL40 application run. After application, run
`sql/40-venue-slot-booking-state-postcheck.sql`: both slot/booking inconsistency counts
and the missing-snapshot count must be zero, the blocked count must match the precheck
baseline, and all four functions must retain authenticated-only execution with an empty
`search_path`. SQL40 deliberately adds no requester policy to `venue_slots`; private
booking history reads the immutable snapshot columns instead. Applied on 15 September
2026 after its precheck against `hivedzrwrrcnjrlirhtv`; the owner-blocked baseline was
preserved at 1 slot, and the post-check found 2 reserved slots, 0 open slots, and no
slot/booking inconsistencies.

Before applying step 38, apply and verify step 39 only after its own explicit approval,
then run `sql/38-close-venue-slot-precheck.sql` against project
`hivedzrwrrcnjrlirhtv` and record the output. That file is read-only — eleven `SELECT`
statements, no DDL, no DML and no RPC call — and confirms the SQL23 venue tables, their
RLS policies and RPC grants, `public.is_admin()`, the SQL35 audit entry point, and that
`public.close_venue_slot_safely(uuid)` does not exist yet. This runbook records no
production evidence for step 23, so its state on production is UNKNOWN until that check
is run; step 38 depends on it and must not be applied on the assumption that it is
there. The precheck only reports state. It authorises nothing: applying step 23, 24
or 38 is a separate action that needs explicit approval from the production owner,
and no agent may apply a migration on the strength of a passing precheck.

Production evidence (14 September 2026): step 39 was applied to project
`hivedzrwrrcnjrlirhtv` in one transaction. The required six SQL23 venue RPCs were
present before changes. The transaction revoked direct `EXECUTE` from `PUBLIC`,
`anon`, and `service_role`, then granted it to `authenticated` only. A read-only
post-check returned six rows, each with `anon = false`, `service_role = false`, and
`authenticated = true`. No venue, court, slot, booking, or user record was changed.

Production evidence (14 September 2026): step 38 was applied to project
`hivedzrwrrcnjrlirhtv` after the read-only venue precheck passed. The guarded
`public.close_venue_slot_safely(uuid)` function exists as `SECURITY DEFINER` with an
empty `search_path`. Effective execution privileges were read-only verified as
`anon = false`, `service_role = false`, and `authenticated = true`. No venue slot or
booking was created, closed, or changed during the apply and verification.

SQL35 must be applied **before** deploying the matching Admin UI/API changes. Until it
is applied, Ranking and Hall of Fame writes intentionally return HTTP 503 instead of
changing data without an audit record. The migration removes direct authenticated
table writes for those two surfaces and exposes only guarded, atomic RPCs. It does not
store admin email addresses, authentication tokens, payment-slip paths or user contact
details. The Audit page is `/admin/audit`; records are append-only and have no web
update/delete action.

Production evidence (22 August 2026): step 15 was applied to Supabase project
`hivedzrwrrcnjrlirhtv`. A read-only verification confirmed
`athlete_highlight_reports`, `athlete_highlights.moderation_status`, RLS on the report
table, four report policies, and the replacement highlight/storage read policies. The
admin moderation page then loaded both queues without its setup warning. The queues had
no real rows. A controlled temporary database fixture subsequently verified queue → hide
→ restore through the authenticated Admin UI, including report resolution and clearing
`hidden_at` / `hidden_by`; the fixture and its cascaded report were then removed and
read-only counts confirmed zero test rows remained. The public user's report-button step
still requires a second signed-in account with a real uploaded Highlight.

Production evidence (22 August 2026): step 16 was applied to project
`hivedzrwrrcnjrlirhtv`. Read-only verification confirmed the deletion-request table,
open-request partial index, RLS, two table policies, and the `SECURITY DEFINER` function
with an empty search path. The function was deliberately not invoked. Supabase default
privileges also left direct EXECUTE grants for `anon` and `service_role`; SQL33 is the
least-privilege correction. It was applied and read-only verification confirmed
`authenticated = true`, `anon = false`, `service_role = false`; the only recorded
EXECUTE grantees are now `authenticated` and the owning `postgres` role. The deletion
RPC was not invoked during either verification.

Production evidence (22 August 2026): step 34 was applied to project
`hivedzrwrrcnjrlirhtv`. Read-only verification confirmed `pg_trgm`, its GIN operator
class, all eight expected indexes, and the `SECURITY DEFINER` Admin summary function
with an empty search path. Function privileges are `authenticated = true`,
`anon = false`, `service_role = false`; the only recorded EXECUTE grantees are
`authenticated` and the owning `postgres` role. The authenticated Admin Operations page
loaded through the summary RPC and displayed the RPC-mode notice; no deployment or
other production setting was changed.

Production evidence (23 August 2026): step 37 was applied to project
`hivedzrwrrcnjrlirhtv` after the payment-data owner approved disposal of four legacy
URL-format slip references. The transaction count guard passed and a read-only query
afterward confirmed `legacy_url_rows = 0` and `null_slip_rows = 4`. No Storage objects
were deleted and no individual payment evidence was opened. The payment-slip viewer was
deployed separately to reject any future URL-format value with HTTP 410 rather than
redirecting it; Vercel deployment `dpl_rSwmAVbMrhoY6JhbUEPa3xxdpxuN` reached Ready and
was aliased to `ballsai-teal.vercel.app`.

Files that must **not** be applied during closed beta:

- `sql/supabase-rls-private-slips.sql` — a standalone alternative to
  `sql/supabase-rls.sql` for an install that stops at the base file. Step 12 already
  makes slips private with a newer version of the same policy. Applying this file
  after step 12 would overwrite the optimized `profiles` policies from step 4 with
  older equivalents. Skip it unless you are deliberately doing a base-only install.
- `sql/sample-data.sql` — demo rows. Closed beta runs on real data only.

After applying, confirm the identity chain is live:

```sql
select tgname from pg_trigger where tgname in (
  'on_auth_user_created',
  'rating_event_sync_athlete_identity',
  'athlete_badge_sync_achievement',
  'athlete_profile_create_rookie_identity'
);

select tgname from pg_trigger
where tgname = 'athlete_profiles_guardian_consent_guard';

select proname from pg_proc where proname in (
  'register_team_safely', 'confirm_payment_safely', 'record_match_result_safely',
  'void_match_result_safely', 'delete_my_athlete_data',
  'invite_team_member', 'respond_team_invite',
  'create_tournament_team_safely', 'submit_tournament_team_safely',
  'request_guardian_link', 'respond_guardian_link', 'revoke_guardian_link',
  'get_match_plan_safely', 'save_match_plan_safely'
);
```

The listed identity triggers and guarded functions must come back. In particular,
`athlete_profiles_guardian_consent_guard` is required after step 22; a successful
SQL query alone is not evidence that the guardian rule is active. After step 19,
also verify that `authenticated` does not have EXECUTE on `create_notification`, and
that it has UPDATE only on `notifications.read_at`:

```sql
select has_function_privilege('authenticated',
  'public.create_notification(uuid, text, text, text, text, text)', 'execute')
  as authenticated_can_create_notification;

select privilege_type, column_name
from information_schema.column_privileges
where table_schema = 'public' and table_name = 'notifications'
  and grantee = 'authenticated' and privilege_type = 'UPDATE';
```

The first query must return `false`; the second must return only `read_at`.

Steps 13–16 are also bundled as `sql/apply-closed-beta-2026-08.sql`, a single
transaction with the same content and the verification queries at the end. Use the bundle
to apply them in one paste, or the individual files if you want to go step by step. The
four numbered files stay the record of what production looks like.

---

## 4. Storage Buckets

| Bucket | Public | Limit | MIME | Created by |
| --- | --- | --- | --- | --- |
| `slips` | **private** | — | JPG/PNG/WEBP enforced in the API | **Create manually** in Storage; step 12 sets `public = false` |
| `athlete-avatars` | public until SQL62, then **private** (T51) | 5 MB | JPG, PNG, WEBP | `sql/athlete-profile-v2.sql`; `sql/62-private-athlete-avatars-v1.sql` makes it private — never flip it in the Dashboard instead: the policy that lets public profiles' photos be signed comes with the file |
| `athlete-highlights` | **private** | 25 MB | JPG, PNG, WEBP, MP4, WEBM | `sql/athlete-highlight-uploads-v1.sql` |

No SQL file creates the `slips` bucket. Create it in the Supabase Storage UI before
the first slip upload, then re-run step 12 (or the single `update storage.buckets`
statement) so it is private.

### How slips are served

Payment evidence is never a public URL. `app/api/teams/[teamId]/payment/route.ts`
stores only the object path (`<user_id>_<team_id>_<timestamp>.<ext>`), and
`app/api/payments/[paymentId]/slip/route.ts` checks that the viewer is the uploader,
the tournament's organizer, or an admin, then redirects to a **60-second signed URL**.
Slip paths uploaded before this change may still be full public URLs; that route
redirects them as-is so old records stay viewable.

Verify after setup:

- The bucket shows as private in Storage.
- Opening a slip as the owning organizer works from `/dashboard`.
- Pasting the raw storage object URL while signed out returns an error.

---

## 5. Roles, Accounts, And RLS Coverage

### Roles

`profiles.role` accepts `user`, `organizer`, `admin`. There is **no UI to change a
role** — set it in the Supabase table editor or by SQL for each real organizer and
admin. Everyone signing up through `/login` starts as `user`.

### Confirm RLS is enabled on every table

- `profiles`
- `tournaments`
- `player_ranks`
- `teams`
- `payments`
- `player_ratings`
- `rating_events`
- `match_results`
- `match_player_performances`
- `athlete_profiles`
- `athlete_videos`
- `athlete_achievements`
- `athlete_skill_assessments`
- `athlete_progress`
- `athlete_xp_events`
- `athlete_badges`
- `athlete_highlights`
- `athlete_highlight_reports`
- `account_deletion_requests`
- `hall_of_fame_entries`
- `storage.objects`

---

## 6. W1 Pilot: 5 คนใช้งานให้จบครบหนึ่งรอบ

เป้าหมายของ W1 ไม่ใช่จำนวนผู้ใช้ แต่คือ **มีผลแข่งจริง 1 นัดที่ทำให้ XP / Badge /
Ranking ของเด็กจริงขยับได้ครบ** โดยไม่ต้องมีนักพัฒนาเข้าไปช่วยกลางทาง

### 6.1 ทีมทดสอบ 5 คน

| บทบาท | จำนวน | `profiles.role` | หน้าที่ในรอบทดสอบ |
| --- | ---: | --- | --- |
| ผู้จัดการแข่งขัน | 1 | `organizer` | สร้างรายการ, ตรวจสลิป, ยืนยันทีม, บันทึกผล |
| นักกีฬา | 3 | `user` | ทำ Card, รับคำเชิญเข้าทีม, ลงแข่ง |
| ผู้ปกครอง | 1 | `user` | ดูโปรไฟล์สาธารณะของน้อง, ทดสอบการแชร์บนมือถือ |
| แอดมิน | (คนในทีมงาน) | `admin` | สร้าง `player_ranks` ให้นักกีฬา 3 คน |

ต้องมีอย่างน้อย **2 ทีมในรายการเดียวกัน** เพราะการบันทึกผลต้องมีทีม A และทีม B ที่
`status = 'confirmed'` ทั้งคู่ ให้ผู้จัดหรือแอดมินสมัครทีมที่สองด้วยบัญชีอีกบัญชีหนึ่ง
(หนึ่งบัญชีสมัครได้หนึ่งทีมต่อหนึ่งรายการ)

### 6.2 ก่อนเชิญ (ทีมงานทำเอง)

1. เพิ่มอีเมลทั้ง 5 คนเป็น **Test user** ใน Google Cloud OAuth (ยังอยู่ Testing mode
   จึงรับได้ถึง 100 บัญชี — ยังไม่ต้อง publish)
2. ตรวจ ENV บน Vercel ครบ 7 ตัวตามข้อ 1 และ `NEXT_PUBLIC_SHOW_DEMO_DATA` ไม่ใช่ `true`
3. Apply SQL ครบตามข้อ 3 และเช็ค trigger/function ตามคำสั่ง SQL ท้ายข้อ 3
4. สร้าง bucket `slips` แบบ private ตามข้อ 4
5. ตั้ง `profiles.role = 'organizer'` ให้ผู้จัด และ `'admin'` ให้ทีมงาน
6. สร้างรายการแข่งจริง 1 รายการจาก `/dashboard/create` — ต้องมี `fee`, `promptpay`,
   จังหวัด, วันแข่ง และ `status = 'open'`
7. รัน `npm run verify:production` และ `BASE_URL=https://ballsai-teal.vercel.app npm run smoke:public`

### 6.3 Flow ที่ต้องผ่านทุกขั้น

| # | ขั้นตอน | ใคร | หน้า | ผลที่ต้องเห็น (ยืนยันได้) |
| ---: | --- | --- | --- | --- |
| 1 | เข้าสู่ระบบ | นักกีฬา | `/login` | ติ๊กยอมรับ Terms/PDPA แล้วเข้าได้ทั้ง Google และ Email OTP |
| 2 | Onboarding | นักกีฬา | `/welcome` | เลือกบทบาท/กีฬา/เป้าหมาย → `profiles.onboarding_completed_at` ถูกเซ็ต |
| 3 | Rookie identity | ระบบ | — | เลือกบทบาท "นักกีฬา" แล้วมีแถวใน `athlete_profiles` และได้ `athlete_progress.xp_total = 50` + badge `rookie` |
| 4 | สร้าง Card | นักกีฬา | `/card` | บันทึกได้, ดาวน์โหลดภาพได้, แชร์บนมือถือได้ |
| 5 | **สร้าง Ranking** | **แอดมิน** | `/admin/create` | เลือก athlete account แล้วสร้าง `player_ranks` (สเตปที่ยังต้องทำมือ — ดูข้อ 6.4) |
| 6 | สร้าง roster | ผู้จัด/โค้ช | `/tournaments/[id]` → `/team-members` | สร้าง draft team ของรายการนั้น → เชิญนักกีฬาที่มีบัญชี → นักกีฬากดรับคำเชิญ → ส่งสมัครได้เมื่อมีสมาชิก accepted อย่างน้อย 1 คน |
| 7 | ส่งสลิป | ผู้จัด/โค้ชที่สร้างทีม | หน้าเดิม ขั้น payment | หลังส่งสมัครแล้วเท่านั้น อัปโหลด JPG/PNG/WEBP ไม่เกิน 5 MB จากมือถือได้, ส่งซ้ำต้องขึ้นข้อความว่ามีรายการชำระแล้ว |
| 8 | ตรวจสลิป | ผู้จัด | `/dashboard` | เปิดสลิปได้ (signed URL), กดยืนยันการชำระเงินสำเร็จ |
| 9 | ยืนยันทีม | ผู้จัด | `/dashboard` | ทีมเป็น `confirmed` และเจ้าของทีมได้อีเมลแจ้ง (ถ้าตั้ง Resend แล้ว) |
| 10 | Preview ผล | ผู้จัด | `/dashboard/results` | เลือกรายการ + 2 ทีม + นักกีฬา แล้วกดคำนวณ เห็น rating ก่อน/หลังของทุกคน |
| 11 | บันทึกผล | ผู้จัด | `/dashboard/results` | ยืนยันแล้วได้ `match_results` + `match_player_performances` + `rating_events` ครบในครั้งเดียว |
| 12 | XP / Badge | นักกีฬา | `/career`, `/profile` | XP เพิ่มขึ้นจากนัดนี้ (ลงเล่น 30, ชนะ +20, ประตู 10/ลูก, แอสซิสต์ 8/ครั้ง, คลีนชีต 15, MVP 35) และ badge ใหม่ขึ้นใน Passport |
| 13 | Ranking | ทุกคน | `/ranking` | Power Rating ใหม่ปรากฏ (API เรียก `revalidateTag('public-ranking')` หลังบันทึกผลสำเร็จ จึงไม่ต้อง deploy ใหม่) |
| 14 | แชร์ | ผู้ปกครอง | `/players/[id]` | เปิดลิงก์บนมือถือได้, มีภาพ Open Graph, ไม่มีเบอร์โทรโชว์ |

### 6.4 สิ่งที่ยังต้องทำมือใน W1 (รู้ไว้ก่อน อย่าตกใจ)

1. **`player_ranks` ต้องสร้างโดยแอดมินทีละคน** ที่ `/admin/create` โดยเลือกจาก athlete
   account ที่มีอยู่ ถ้านักกีฬาไม่มีแถวนี้ ผู้จัดจะไม่เห็นชื่อในหน้าบันทึกผล และ XP
   จากการแข่งจะไม่เกิดขึ้นเลย (ได้แค่ 50 XP กับ badge Rookie)
2. **ทีมใช้ roster จากบัญชีจริง** ผู้จัด/โค้ชเชิญด้วยอีเมล และนักกีฬาต้องกดรับคำเชิญ
   ก่อนทีมส่งสมัครได้ ผู้จัดเลือกลงผลแข่งได้เฉพาะสมาชิกที่มีสถานะ `accepted`
3. **`sport` และ `season` ถูก fix ไว้ที่ `football` / `2026`** ในหน้า ranking, results,
   admin, hall และ card — W1 ใช้ค่านี้เท่านั้น
4. Card ของนักกีฬาที่ยังไม่มี `player_ranks` จะแสดงสเตตค่าเริ่มต้น
   (OVR 65 / PAC 66 / SHO 62 / PAS 64 / DRI 65 / DEF 55) ซึ่งเป็นค่าตั้งต้น ไม่ใช่ผลงานจริง
   ให้บอกผู้ทดสอบตรง ๆ ว่าตัวเลขจะเป็นของจริงหลังแอดมินสร้าง ranking และมีผลแข่งเข้าระบบ

### 6.5 ช่องรับปัญหา

LINE group + Google Form 5 ช่อง: บทบาท / หน้าจอที่อยู่ / กดอะไร / เจออะไร / ภาพหน้าจอ
ตอบกลับภายใน 24 ชม. ปัญหาที่ทำให้ flow ตันต้องแก้ก่อนขยายกลุ่มถัดไป

### 6.6 เกณฑ์ผ่าน W1 ก่อนขยายเป็น 20 คน

- นักกีฬาทั้ง 3 คนทำ Card เสร็จเองโดยไม่ต้องถามแอดมิน
- มีผลแข่งจริง 1 นัดที่ทำให้ XP, Badge และ Ranking ขยับครบทั้งสามที่
- อัปโหลดสลิปจากมือถือสำเร็จ และเปิดดูได้เฉพาะเจ้าของ/ผู้จัด/แอดมิน
- ผู้ปกครองเปิดลิงก์โปรไฟล์สาธารณะบนมือถือได้ และไม่เห็นข้อมูลติดต่อของเด็ก
- ไม่มี error ระดับ blocker ค้างใน production logs

---

## 7. End-To-End Smoke Tests By Role

Run these once per environment, in addition to the W1 pilot.

### Player

- Sign up with email OTP, and separately with Google.
- Land on `/welcome`, finish the three steps, and confirm a second login skips it.
- Edit profile: athlete photo, birth date, height, weight, highlight, achievement.
- Confirm a minor cannot publish without guardian consent, in the form and by calling
  the API directly with the athlete's own session (both must refuse).
- Confirm the public athlete profile never shows a phone number.
- Open `/athletes` and filter by province and position.
- Open `/ranking`.
- Browse an open tournament, then open `/team-members` and accept an invitation from
  a coach/organizer. Confirm the accepted team is visible on `/profile` and `/career`.
- Confirm an athlete cannot create or pay for a team; the coach/organizer owns those steps.
- Confirm accepting an invitation does not allow the athlete to appear for another team
  in the same tournament.
- Request data deletion from `/profile`, then confirm: the athlete profile, highlights and
  badges are gone, the public profile no longer resolves, ranking rows read
  `ATHLETE REMOVED` with no account link, and the request shows in `/admin/operations`.
  Use a throwaway test account — this cannot be undone.

### Organizer

- Log in.
- Create a tournament, then edit it.
- Close and reopen registration.
- Review registered teams and open an uploaded slip.
- Confirm payment.
- Approve or reject a team, and confirm the applicant receives email.
- Enter a match result in `/dashboard/results`, preview rating changes, confirm.
- Confirm only teams with `status = 'confirmed'` appear as selectable teams.
- Search an athlete by name or team in the performance rows.
- Void a recorded result from "ผลที่บันทึกไปแล้ว" and confirm Power Rating, XP and any
  badge earned from that match are reverted, and that `/ranking` reflects it.
- Confirm voiding a result that is no longer the athlete's newest match is refused
  with a readable message.

### Admin

- Log in.
- Create a `player_ranks` record linked to an athlete account.
- Edit and delete a player rank.
- Confirm only admin can change ranking data.
- Award a Hall of Fame entry at `/admin/hall` and see it on `/hall-of-fame`.
- Report a highlight from a public profile as another account, then open
  `/admin/moderation`, hide it, and confirm it disappears from the public profile while
  the owner still sees it marked as hidden.
- Unhide the same clip and confirm it returns, then confirm a permanent delete removes
  both the row and the stored file.
- Open `/admin/operations` and confirm the readiness rows.

The legacy `/api/ratings` endpoint is intentionally disabled. Rating must be recorded
through the match-result flow so the result, player performance, Power Rating, ranking
and rating event are committed together by `record_match_result_safely`.

---

## 8. RLS And API Security Tests

Use the safe-mode script with real JWTs taken from a live Supabase session:

```bash
npm run security:rls
```

Required environment variables: `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, `PLAYER_JWT`, `ORGANIZER_JWT`, `ADMIN_JWT`.
Optional target IDs: `PLAYER_B_PROFILE_ID`, `PLAYER_RANK_ID`,
`FOREIGN_TOURNAMENT_ID`, `OWNED_TOURNAMENT_ID`, `PLAYER_B_TEAM_ID`, `OWNED_TEAM_ID`.
After SQL31, also supply `PLAYER_OWN_DISPUTE_ID`, `PLAYER_FOREIGN_DISPUTE_ID`,
`PLAYER_OWN_VERIFICATION_EVENT_ID` and `PLAYER_FOREIGN_VERIFICATION_EVENT_ID` to
prove that the data subject can read their own trust history but cannot read another
athlete's dispute or verification event.

Minors' and private data (T21, `scripts/rls-minor-checks.mjs`, read-only in every mode):
the script sweeps 18 private tables signed out, checks that a public profile exists (so the
next checks cannot pass on an empty database), and that no birth date or guardian consent
record of a public profile is readable signed out or by an unrelated signed-in user; only
the athlete reads their own, through `my_athlete_private`. With `UNRELATED_JWT`,
`GUARDIAN_JWT` (optional `ATHLETE_JWT`, else `PLAYER_JWT`) and the test ids
`PRIVATE_PROFILE_USER_ID`, `GUARDIAN_LINK_ID`, `FOREIGN_TEAM_ID`, `FOREIGN_PAYMENT_ID`,
`UNPUBLISHED_FIXTURE_TOURNAMENT_ID`, `FOREIGN_ORGANIZATION_ID`, it also checks each person
against someone else's records. A table the database does not have yet is reported as
SKIP, never as PASS; so is a function it does not have yet. Known finding before the first
run: the birth-date and consent checks FAIL until SQL58 is applied (T50, see
`docs/national-readiness.md`).

Rollback (T31): [`docs/rollback-plan.md`](rollback-plan.md) — roll code back on Vercel first,
SQL last. Prepared, drilled rollbacks for SQL57–60 are in `sql/rollback/` (incident use only,
owner approval, Staging first). With SQL58 applied, never roll the app back before PR #49.

Concurrency (T14, `npm run test:concurrency`, `scripts/concurrency-checks.mjs`): fires the
same write `PARALLEL` (default 8) times at once and checks the data stays correct — one
booking for one slot, at most one team per coach per tournament, a slip confirmed once, a
result submission recorded once. It writes on purpose, so it refuses any project but
Staging and needs `ALLOW_CONCURRENCY_WRITES=true`. Inputs per check: `BOOKER_JWTS` +
`RACE_SLOT_ID`; `COACH_JWT` + `RACE_TOURNAMENT_ID`; `ORGANIZER_JWT` + `RACE_PAYMENT_ID`;
`ORGANIZER_JWT` + `RESULT_TOURNAMENT_ID`, `RESULT_TEAM_A_ID`, `RESULT_TEAM_B_ID`,
`RESULT_PLAYER_RANK_ID`. Use a disposable venue slot, tournament, team and payment; void
the test result afterwards. The result check fails until SQL60 is applied.

Safe mode checks read access and skips all writes. Run write checks only against an
isolated beta tournament, with explicit confirmation:

```bash
ALLOW_RLS_WRITE_TESTS=true npm run security:rls
```

Minimum checks:

- Player A cannot update Player B's profile.
- Player cannot update `player_ranks`.
- Player cannot update another user's team.
- Organizer cannot update a tournament owned by another organizer.
- Organizer can update only teams/payments for tournaments they own.
- Admin can update ranking data.
- After SQL31: Player can read their own dispute and verification event but cannot read
  another athlete's equivalent record; admin can read the Trust queue.
- A signed-out request cannot read a `slips` object directly.

---

## 9. Monitoring Checks

The app writes structured JSON logs for high-risk server actions:

- `team_registered`
- `team_registration_failed`
- `team_status_email_failed`
- `payment_slip_uploaded`
- `payment_slip_upload_failed`
- `payment_record_create_failed`
- `match_result_confirmed`
- `match_result_create_failed`
- `match_result_voided`
- `match_result_void_failed`
- `highlight_reported`
- `highlight_report_failed`
- `highlight_moderated`
- `highlight_moderation_failed`
- `account_data_deleted`
- `account_data_deletion_failed`
- `account_data_deletion_storage_failed`
- `tournament_updated`
- `tournament_update_failed`
- `public_rankings_fetch_failed`, `public_identity_ranking_fetch_failed`,
  `public_ranking_provinces_fetch_failed`, `public_tournaments_fetch_failed`,
  `public_open_tournaments_fetch_failed`, `public_hall_of_fame_fetch_failed`

Rating and rating-event failures no longer have their own events: those writes happen
inside `record_match_result_safely`, so a failure surfaces as
`match_result_create_failed` with the Postgres error code. A `409` with
`RATING_CHANGED` means another result updated the same player first — recalculate and
save again.

Before beta, confirm these logs appear in the local terminal and in Vercel runtime
logs.

Open `/admin/operations` as an admin and confirm:

- Supabase database is ready.
- `slips` is private.
- Demo fallback is disabled.
- Email sender and distributed rate limiting show ready before a multi-instance
  deployment.

Recommended next setup: Sentry for error tracking, PostHog or Vercel Web Analytics
for product analytics, Vercel runtime logs for request visibility.

---

## 10. Data Deletion

The application does not hold the Supabase service role key, so it cannot remove an auth
user. `delete_my_athlete_data()` erases the athlete's own data, anonymises their ranking
rows and files the request; an admin then deletes the account in Supabase →
Authentication → Users and sets `completed_at` on the row in
`account_deletion_requests`. Open requests are listed on `/admin/operations`. Keep that
step in the support rota before inviting the public.

---

## 11. Ready To Invite The First Organizer

Invite the first organizer only when all of these are true:

- SQL steps 1–29 applied to project `hivedzrwrrcnjrlirhtv`, with the required triggers,
  guarded functions, notification/roster tables, and step-19 privilege checks confirmed.
- `slips` bucket exists and is private; a signed slip URL opens for the organizer and
  fails for a signed-out request.
- Demo fallback is not `true` in production.
- `npm run verify:production` and `npm run smoke:public` pass against the production
  URL.
- Three-role end-to-end tests pass.
- RLS smoke tests pass in safe mode.
- Slip upload works from a real phone.
- A match result changes Power Rating, XP, Badge and `/ranking`.
- No blocker errors in production logs.
- Data Trust Phase 1 is reviewed and its RLS policies are tested with real JWTs before
  applying step 31. Do not apply step 30 until BDS reversal on a voided result is
  demonstrated and documented.
