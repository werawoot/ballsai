# BALLSAI Closed Beta Runbook

Use this checklist before inviting real organizers and athletes. Closed beta should run with real database data only.

## 1. Production Environment

Set these values in Vercel or the production host:

```bash
NEXT_PUBLIC_SUPABASE_URL=<production_supabase_url>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<production_supabase_anon_key>
NEXT_PUBLIC_SHOW_DEMO_DATA=false
RESEND_API_KEY=<resend_api_key_if_email_notifications_are_enabled>
RESEND_FROM_EMAIL=BallDoenSai.com <verified-sender@your-domain.com>
UPSTASH_REDIS_REST_URL=<upstash_redis_rest_url>
UPSTASH_REDIS_REST_TOKEN=<upstash_redis_rest_token>
```

Do not set `NEXT_PUBLIC_SHOW_DEMO_DATA=true` in closed beta or production.

## 2. Apply Supabase SQL

Apply SQL in this order from the Supabase SQL editor:

1. `sql/check-duplicates-before-unique-indexes.sql`
2. Fix duplicate rows if the duplicate check returns anything.
3. `sql/supabase-rls.sql`
4. `sql/fix-profile-auth-trigger.sql`
5. `sql/ballsai-rating-v1.sql`
6. `sql/athlete-profile-v2.sql`
7. `sql/link-player-ranks-to-profiles.sql`
8. `sql/production-hardening.sql`

Use `sql/supabase-rls-private-slips.sql` instead of `sql/supabase-rls.sql` only if the app is changed to serve signed/private slip URLs.

Confirm these tables have RLS enabled:

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
- `storage.objects`

Confirm the `slips` storage bucket exists.
Confirm the public `athlete-avatars` bucket exists with a 5 MB file limit and only allows JPG, PNG, and WEBP.

## 3. Create Real Test Accounts

Create and verify three accounts:

```text
player1@test.com
organizer1@test.com
admin1@test.com
```

Set roles in `profiles.role`:

```text
player1@test.com -> user
organizer1@test.com -> organizer
admin1@test.com -> admin
```

## 4. End-to-End Smoke Tests

### Player

- Sign up with email OTP.
- Log in.
- Edit profile.
- Add an athlete photo URL, birth date, height, weight, highlight, and achievement.
- Confirm a minor cannot publish without guardian consent.
- Confirm the public athlete profile never shows a phone number.
- Open Athlete Database and filter by province and position.
- Open Ranking.
- Register a team for an open tournament.
- Upload a JPG/PNG/WEBP payment slip under 5 MB.
- Confirm duplicate team registration shows a readable error.
- Confirm duplicate slip upload does not create duplicate payment records.

### Organizer

- Log in.
- Create a tournament.
- Edit the tournament.
- Close and reopen registration.
- Review registered teams.
- Open uploaded slip.
- Confirm payment.
- Approve or reject a team.
- Enter match result in `/dashboard/results`.
- Preview rating changes.
- Confirm result.

The legacy `/api/ratings` endpoint is intentionally disabled. Rating must be
recorded through the match-result flow so the result, player performance,
Power Rating, ranking, and rating event are committed together.

### Admin

- Log in.
- Add a player rank.
- Edit a player rank.
- Confirm only admin can manually change ranking data.

## 5. RLS And API Security Tests

Use the safe-mode script with real JWTs from the Supabase session:

```bash
npm run security:rls
```

Set the three JWTs and optional target IDs as environment variables. Safe mode
checks read access and skips all writes. Only run write checks against an
isolated beta tournament, with explicit confirmation:

```bash
ALLOW_RLS_WRITE_TESTS=true npm run security:rls
```

Minimum checks:

- Player A cannot update Player B profile.
- Player cannot update `player_ranks`.
- Player cannot update another user's team.
- Organizer cannot update a tournament owned by another organizer.
- Organizer can update only teams/payments for tournaments they own.
- Admin can update ranking data.

## 6. Monitoring Checks

The app now writes structured JSON logs for high-risk server actions:

- `payment_slip_uploaded`
- `payment_slip_upload_failed`
- `payment_record_create_failed`
- `match_result_confirmed`
- `match_result_create_failed`
- `match_rating_update_failed`
- `rating_event_create_failed`
- `tournament_updated`
- `tournament_update_failed`

Before beta, confirm these logs appear in local terminal and production runtime logs.

Open `/admin/operations` as an admin and confirm:

- Supabase database is ready.
- `slips` is private.
- Demo fallback is disabled.
- Email sender and distributed rate limiting show ready before a multi-instance deployment.

Recommended next setup:

- Sentry for error tracking.
- PostHog or Vercel Web Analytics for product analytics.
- Vercel runtime logs for request/debug visibility.

## 7. Ready To Invite First Organizer

Invite the first organizer only when these are true:

- Demo fallback is disabled in production.
- SQL has been applied to the real Supabase project.
- Three-role end-to-end tests pass.
- RLS smoke tests pass.
- Slip upload works from mobile.
- Match result changes Power Rating and Ranking.
- No blocker errors appear in logs.
