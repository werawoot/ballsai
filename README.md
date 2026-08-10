# BallDoenSai.com

BallDoenSai.com is a Thai youth sports ranking and tournament registration platform built with Next.js and Supabase.

## Production environment

- `RESEND_API_KEY` and `RESEND_FROM_EMAIL` for transactional email.
- `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` for shared rate limits across server instances. Without these variables, the app uses a best-effort in-memory limit for local development only.

Before a closed-beta or production deployment, run `npm run verify:production` with the deployment environment variables available. It verifies configuration without printing any secret values.

## Features

- Public ranking pages for player cards and leaderboard browsing.
- Public tournament listing and tournament detail pages.
- Email OTP login through Supabase Auth.
- Player profile editing and personal team registration history.
- Organizer dashboard for creating tournaments, reviewing team registrations, checking payment slips, and confirming or rejecting teams.
- Organizer tournament editing and registration open/closed controls.
- Payment slip upload flow with server-side validation for file type and file size.
- Admin player management.
- BALLSAI Rating V1 with a single Power Rating value backed by Elo-style match movement and sport-specific performance modifiers.
- Organizer match result entry with preview-before-confirm rating updates.
- Supabase RLS policy scripts for public slips or private slips setups.
- Closed beta legal pages for Terms, Privacy, and PDPA consent at login.
- Structured server logs for payment upload, match result/rating updates, and tournament updates.

## Tech Stack

- Next.js App Router
- React
- TypeScript
- Supabase Auth, Database, Storage, and RLS
- Resend for registration status emails
- Tailwind/PostCSS plus component-level styles

## Environment Variables

Create `.env.local` with:

```bash
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
RESEND_API_KEY=your_resend_api_key
RESEND_FROM_EMAIL="BallDoenSai.com <verified-sender@your-domain.com>"
UPSTASH_REDIS_REST_URL=your_upstash_redis_rest_url
UPSTASH_REDIS_REST_TOKEN=your_upstash_redis_rest_token
NEXT_PUBLIC_SHOW_DEMO_DATA=false
```

`RESEND_API_KEY` is required only for confirmation/rejection notification emails. The app returns a clear API error if it is missing.

Use `NEXT_PUBLIC_SHOW_DEMO_DATA=true` only in local development when the database is empty. Production and closed beta environments should set it to `false` so empty states reflect the real database.

## Supabase Setup

1. Create the required tables in Supabase: `profiles`, `player_ranks`, `tournaments`, `teams`, and `payments`.
2. Create a Storage bucket named `slips`.
3. Apply `sql/supabase-rls.sql`, then `sql/ballsai-rating-v1.sql`, and finally `sql/production-hardening.sql`. The current app uses private slip storage and signed URLs.
4. Before applying unique indexes to an existing database, run `sql/check-duplicates-before-unique-indexes.sql` and clean duplicate rows if needed.
5. Set user roles in `profiles.role` as needed: `user`, `organizer`, or `admin`.
6. Confirm the `slips` bucket is private after applying production hardening.

## Rating V1

BALLSAI uses one public-facing value: `Power Rating`.

- New players start at `1000`.
- The visible ranking still reads from `player_ranks.pts` for compatibility.
- `player_ratings.power_rating` is the normalized Rating V1 source of truth after applying `sql/ballsai-rating-v1.sql`.
- `rating_events` stores every rating movement with match and performance breakdowns.
- Activity is treated as confidence:
  - `< 3` matches: `provisional`
  - `3-9` matches: `active`
  - `10+` matches: `full`

Organizers can use `/dashboard/results` to enter match results:

1. Select a tournament.
2. Select Team A, Team B, and scores.
3. Add player performance rows.
4. Preview Power Rating changes.
5. Confirm the result.

Confirmed results are stored in `match_results`, player-level performance rows are stored in `match_player_performances`, and rating changes are audited in `rating_events`. This single flow updates all related records atomically.

## Development

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Verification

Run these before deploying:

```bash
npm run lint
npm run build
```

Current expected result: lint passes with no warnings and production build completes successfully.

With the app running locally, verify all public pages without writing data:

```bash
npm run smoke:public
```

To use the same test against a Vercel preview or production deployment:

```bash
BASE_URL=https://your-deployment-url npm run smoke:public
```

For closed beta readiness, follow `docs/closed-beta-runbook.md`.

## Release Checklist

- Confirm Supabase URL and anon key are set in the deployment environment.
- Confirm `RESEND_API_KEY` is set if email notifications should be active.
- Confirm `NEXT_PUBLIC_SHOW_DEMO_DATA=false` in production/closed beta.
- Confirm the `slips` bucket exists and matches the selected RLS policy.
- Smoke test login, profile editing, tournament creation, team registration, slip upload, payment confirmation, team confirmation/rejection, and profile status display.
- Verify at least one organizer account and one normal user account in staging or production.
- Run `scripts/rls-smoke-test.mjs` with real role JWTs before inviting users.
