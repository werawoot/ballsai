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
2. Database changes target Supabase project ref **`hivedzrwrrcnjrlirhtv`** only. Verify
   the project ref before proposing SQL. Applying SQL to another project has caused real
   risk before.
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
   signed URL after checking the viewer. Never switch a slip to a public URL. Athlete
   photos (`athlete-avatars`) follow the same rule: store the object path and show it
   through `lib/athlete-avatar.ts`; never `getPublicUrl` (T51, SQL62).
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

## Product rule: each role can use the app on its own first (owner, 12 Oct 2026)

Every role (athlete, guardian, coach, assistant coach, organizer, venue owner) must be able
to sign up and use the features that are theirs **straight away, alone**, without waiting
for anyone to invite them. An invitation is asked for only at the point where a feature
truly needs another person (a coach adding a real athlete to a roster, a guardian linking
to their own child, a head coach adding an assistant). Never put an invitation, a
tournament registration or another person's approval in front of something one person can
do by themselves. When a feature needs someone else, the page still shows what this person
can do now, and the invitation appears as one clear next step, not as a wall.

Known places that break this rule today (to fix, design agreed first):

- A coach gets a team only by registering it in a tournament (`teams.tournament_id`,
  `create_team_safely`). Team tools (events, news, training plans, coach notes, minutes,
  match plan) are therefore locked until a tournament exists.
- An athlete and a guardian see team features only after a coach's invitation.
- `/match-plan` needs a registered team.

## Target: nationwide use

The owner's goal is a system all of Thailand can use. Build every change for that, not
only so the code runs or the tests pass. Before proposing or handing back any change,
answer all five:

1. **Data at 100×.** It still works with a hundred times today's rows: lists are
   paginated, nothing is silently capped or truncated, and hot queries have an index.
2. **People at the same moment.** Concurrent or repeated requests leave the data correct:
   no duplicates, no double booking, and a retried request has the same effect as one.
3. **Minors' data at scale.** RLS, rate limits and the PDPA rules hold for hundreds of
   thousands of young athletes, not just for a handful of testers.
4. **No manual step that grows with users.** A task a person must do by hand for each
   athlete, team or venue does not work nationwide; name it and plan how it goes away.
5. **Evidence, not expectation.** Show the numbers or test results that prove 1–4.

A change that fails any of the five is reported as "not ready for nationwide use", with
the reason. It is never reported as done. The gaps already known, and the agreed task
list (T01–T44) that closes them, are in
[`docs/national-readiness.md`](docs/national-readiness.md). Pick work from that list in
phase order and update its status with evidence.

## AI engineering preflight

Before starting any non-trivial change, bug investigation, or decision that depends on
external/current facts, choose and use the relevant installed skill **before** changing
implementation:

- `tdd` — new behaviour or a bug fix: agree the observable seam, write/adjust the
  regression test first where practical, then implement and verify.
- `diagnosing-bugs` — a report that something is broken, failing, slow, or inconsistent:
  reproduce and isolate the cause before proposing a fix. Do not guess-and-patch.
- `research` — architecture, vendor/API, security, legal/PDPA, or other fact-dependent
  decisions: use primary sources and save a cited finding before committing to a design.

The owner asked (18 Oct 2026) that Matt Pocock's skills be used alongside development from
now on. `.claude/settings.json` enables the `mattpocock-skills@mattpocock` plugin
(GitHub `mattpocock/skills`) for every session of this repo. Use, where they fit:

- `grill-me` / `grill-with-docs` — before any design that must be agreed first (the team
  roster rewrite, own teams without a tournament): interview the owner one question at a
  time until the plan has no open gaps.
- `code-review` — on every PR before asking the owner to merge.
- `prototype` — a throwaway page to try a UX change before building it.
- `wizard` — step-by-step scripts for steps only the owner can do (SMTP, dashboards).
- `to-questionnaire` — questions for real beta coaches, guardians or organizers.
- `handoff` — hand work to another agent or session.

The tracker-based skills (`setup-matt-pocock-skills`, `to-spec`, `to-tickets`,
`wayfinder`, `triage`, `implement-spec`) write tracker files: ask the owner before setting
them up; the task list stays in `docs/national-readiness.md` until then.

The agent must state which of these skills it is applying in commentary. A small,
obvious edit may skip them, but must say why. These skills never override the hard rules
above: in particular they do not authorize secret access, production changes, SQL apply,
deployments, emails, or commits without the required user approval.

## Verification before handing work back

```bash
npm run lint
npm run build
```

CI ([.github/workflows/ci.yml](.github/workflows/ci.yml)) runs both on every push, plus
`node --check` on the scripts in `scripts/`, a gitleaks scan of the whole git history and
a production dependency audit that fails on any high/critical advisory without a dated
entry in `security/audit-exceptions.json` ([docs/security-checks.md](docs/security-checks.md)).
Operational checks:
`npm run verify:production`, `npm run smoke:public`, `npm run security:rls`.

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

- `player_ranks` rows: until `sql/61-first-match-rank-v1.sql` is applied, an admin creates
  them at `/admin/create`. After it, an athlete's first verified match creates the row (only
  for a public profile, because a rank row is public); PAC/SHO/PAS/DRI/DEF stay NULL (not
  assessed) until a coach or admin assesses them, and the UI shows them as a dash.
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
