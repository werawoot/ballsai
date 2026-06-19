# BALLSAI

BALLSAI is a Thai youth sports ranking and tournament registration platform built with Next.js and Supabase.

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
NEXT_PUBLIC_SHOW_DEMO_DATA=false
```

`RESEND_API_KEY` is required only for confirmation/rejection notification emails. The app returns a clear API error if it is missing.

Use `NEXT_PUBLIC_SHOW_DEMO_DATA=true` only in local development when the database is empty. Production and closed beta environments should set it to `false` so empty states reflect the real database.

## Supabase Setup

1. Create the required tables in Supabase: `profiles`, `player_ranks`, `tournaments`, `teams`, and `payments`.
2. Create a Storage bucket named `slips`.
3. Apply one RLS script:
   - `sql/supabase-rls.sql` for public slip image URLs.
   - `sql/supabase-rls-private-slips.sql` if you adapt the app to signed/private slip URLs.
4. Before applying unique indexes to an existing database, run `sql/check-duplicates-before-unique-indexes.sql` and clean duplicate rows if needed.
5. Set user roles in `profiles.role` as needed: `user`, `organizer`, or `admin`.
6. Apply `sql/ballsai-rating-v1.sql` to add `sports`, `player_ratings`, and `rating_events`.

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

Admin rating updates can be posted to:

```http
POST /api/ratings
```

Example body:

```json
{
  "playerRankId": "player_rank_uuid",
  "result": "win",
  "opponentRating": 1500,
  "goals": 1,
  "assists": 1,
  "mvp": true
}
```

The API updates `player_ratings`, writes a `rating_events` audit row, and syncs `player_ranks.pts`, `player_ranks.ovr`, and `player_ranks.rank_change` so existing ranking pages update immediately.

Organizers can use `/dashboard/results` to enter match results:

1. Select a tournament.
2. Select Team A, Team B, and scores.
3. Add player performance rows.
4. Preview Power Rating changes.
5. Confirm the result.

Confirmed results are stored in `match_results`, player-level performance rows are stored in `match_player_performances`, and rating changes are audited in `rating_events`.

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

For closed beta readiness, follow `docs/closed-beta-runbook.md`.

## Release Checklist

- Confirm Supabase URL and anon key are set in the deployment environment.
- Confirm `RESEND_API_KEY` is set if email notifications should be active.
- Confirm `NEXT_PUBLIC_SHOW_DEMO_DATA=false` in production/closed beta.
- Confirm the `slips` bucket exists and matches the selected RLS policy.
- Smoke test login, profile editing, tournament creation, team registration, slip upload, payment confirmation, team confirmation/rejection, and profile status display.
- Verify at least one organizer account and one normal user account in staging or production.
- Run `scripts/rls-smoke-test.mjs` with real role JWTs before inviting users.
