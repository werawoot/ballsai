# AGENTS.md — BallDoenSai.com

Read this before touching anything. Full context lives in two documents:

- [`README.md`](README.md) — vision, current status, routes, SQL inventory, handoff
- [`docs/closed-beta-runbook.md`](docs/closed-beta-runbook.md) — SQL apply order, storage,
  roles, the W1 pilot script, security and monitoring checks

Repository name is `ballsai`. The product name is **BallDoenSai.com**. It is a Digital
Sports Identity platform for Thai youth footballers: every verified match result must
turn into Player Card, Power Rating, XP, Badge, Career Timeline, Highlight and Hall of
Fame. Users are minors, their guardians, coaches and tournament organizers.

## Hard rules

1. **Never** commit or print secrets. Do not read, edit, or echo `.env.local`. Google
   OAuth client ID/secret live in the Supabase dashboard, not in the repo.
2. Database changes for development and verification may target the dedicated Staging
   project ref **`vorpnkedpscsqhnrssrl`**. Production uses project ref
   **`hivedzrwrrcnjrlirhtv`** and must not be changed unless the owner gives separate,
   explicit approval for that production action. Verify the project ref immediately
   before every database operation; never apply SQL to any other project.
3. **Never edit an SQL file that has already been applied.** Every schema or function
   change is a new file in `sql/`, then added to the runbook table with its order and
   dependencies. `sql/` is the record of what production looks like.
   `sql/apply-closed-beta-2026-08.sql` is only a convenience bundle of steps 13–16 for a
   single paste; add new work as its own numbered file, never inside the bundle.
4. Do **not** apply `sql/supabase-rls-private-slips.sql`. `sql/production-hardening.sql`
   already makes the `slips` bucket private with a newer policy, and the private-slips
   file would overwrite the optimized `profiles` policies. Do not apply
   `sql/sample-data.sql` outside a demo environment.
5. Demo data renders only when `NEXT_PUBLIC_SHOW_DEMO_DATA` is exactly `true`. Closed
   beta and production run on real data.
6. Payment slips are private. The app stores an object path and serves a 60-second
   signed URL after checking the viewer. Never switch a slip to a public URL.
7. Preserve the home page visual language: dark sport editorial, red accent `#CC0001`,
   dynamic motion, athlete pride. Do not restyle the home page as a side effect.
8. For any athlete-facing data, answer "where does this come from and how verified is
   it": `self` / `coach_verified` / `performance_verified`. Never present a default value
   as performance. A card without a `player_ranks` row is a STARTER card and says so.
9. A public athlete profile needs a birth date, and a minor needs recorded guardian
   consent. This is enforced in `app/profile/EditProfileForm.tsx` **and** by a database
   trigger (`sql/guardian-consent-enforcement-v1.sql`). Never weaken either side. The
   admin password form lives at `/login?admin=1` and must stay unadvertised on the public
   login page.
10. Never `git push --force`. Pull before starting; this branch is worked on by more than
    one agent.
11. Do not call anything "100%" until a real closed-beta group has completed the whole
    flow on real data.

## Verification before handing work back

```bash
npm run lint
npm run build
```

CI ([.github/workflows/ci.yml](.github/workflows/ci.yml)) runs both on every push, plus
`node --check` on the scripts in `scripts/`. Operational checks:
`npm run verify:production`, `npm run smoke:public`, `npm run security:rls`.

## Agent skills

### Issue tracker

Issues and specs are tracked in GitHub Issues for `werawoot/ballsai`. See
`docs/agents/issue-tracker.md`.

### Triage labels

Use the default mattpocock/skills triage label vocabulary. See
`docs/agents/triage-labels.md`.

### Domain docs

Use a single-context domain-doc layout rooted in this repo, with ADRs in
`docs/decisions/`. See `docs/agents/domain.md`.

## Current state — 11 August 2026

Working: login (Google OAuth + email OTP), `/welcome` onboarding, Player Card builder,
athlete profile, highlights, Career Passport, Hall of Fame, tournaments, team
registration, slip upload and confirmation, match result recording with rating preview,
XP/Badge triggers, void of a recorded match result, highlight reporting with an admin
moderation queue at `/admin/moderation`, PDPA data deletion from `/profile`.

Not proven yet: nothing has run against real users. No real organizer, tournament,
athlete or match result exists in the database. Closed beta W1 (5 testers) is the next
milestone; see runbook §6.

Pending human action: apply SQL steps 1–16 from runbook §3, create the private `slips`
bucket, set `profiles.role` for organizers/admins, add Google OAuth test users. In
particular `sql/match-result-void-v1.sql` must be applied before the void button works —
the API returns HTTP 503 with instructions until then — and
`sql/guardian-consent-enforcement-v1.sql` before relying on the consent rule server-side.

Known manual seams, by design for now:

- `player_ranks` rows are created by an admin at `/admin/create`, one by one or with the
  batch action. An athlete without one earns no match XP.
- Team rosters are free text, so the athlete list in `/dashboard/results` is the whole
  season and is searched by name/team.
- Removing an auth account is a human step: the app holds no service role key on purpose,
  so `delete_my_athlete_data()` erases the athlete's data and files a request in
  `account_deletion_requests` for an admin to close. Do not add a service role key to the
  app to automate this without the owner deciding it.
- Only one competition window is active at a time. `lib/season.ts` is the single source:
  `ACTIVE_SPORT` and `ACTIVE_SEASON`, from `NEXT_PUBLIC_ACTIVE_SPORT` /
  `NEXT_PUBLIC_ACTIVE_SEASON`, defaulting to `football` / `2026`. Never write those
  literals into a query again — import from `lib/season.ts`. The sport picker in
  `/welcome` is a user choice and keeps its own list.

## Next tasks, in order

Before expanding past 5 testers: real team roster linking members to accounts
(`team_members`, new migration); in-app notifications.

Before public launch: RLS tests with real JWTs; load and rate-limit testing; Google OAuth
published and a custom SMTP sender configured in Supabase Auth so email OTP is not
throttled.

**Do not start the team roster rewrite without agreeing the design first.** It changes
registration, results and RLS at once.

---

## Architecture documentation (source of truth for AI agents)

`docs/architecture/**` is the technical map of the system (C4 context/container/
component, data flow, sequence, ERD, deployment, API map, AI architecture) plus
`docs/decisions/**` (ADRs) and `docs/data/README.md` (schema gaps). Read it before
changing structure. Rules every AI coding agent must follow:

1. **Read the architecture before editing code.** Start at
   `docs/architecture/README.md`. Know the containers/components and the verified-result
   integrity chain (`match_results` -> `rating_events` -> triggers -> rating/XP/badge)
   before touching DB, API, or rating logic.
2. **Never break the existing architecture without notice.** Do not introduce a second
   auth path, a second rating engine, or client-side rating/XP writes. Safe writes go
   through the `security definer` RPCs in `sql/`.
3. **Check Data Flow before changing DB/API.** `docs/architecture/data-flow.md` and
   `sequence.md` show how registration, match results, ranking and XP connect. A schema
   or API change that forks that chain must be discussed first.
4. **Update documentation when architecture changes.** New table/column/FK or RLS ->
   update `erd.md` + `docs/data/README.md`. New/changed route handler -> `api-map.md`.
   New diagram/component -> `system-architecture.md`. New decision -> add an ADR in
   `docs/decisions/` and link it from `docs/decisions/README.md`. See
   `docs/architecture/governance.md`.
5. **Never create a duplicate service without checking the existing one.** Reuse
   Supabase Auth, `lib/rating.ts`, the existing RPC functions, and `lib/*` before adding
   a new dependency or module.
6. **AI features are PLANNED only.** No AI/ML/CV code exists. Do not add an AI dependency
   or claim AI is built. If you start one, follow `docs/architecture/ai-architecture.md`
   and `docs/decisions/ADR-004-ai-architecture.md` (organizer-verified, minor-private).

Status labels used in the docs: **EXISTING** (in code), **PLANNED** (designed, not
built), **UNKNOWN** (insufficient evidence — never assume).
