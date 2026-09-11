# API Documentation Index — BallDoenSai.com

The full API inventory, endpoint tables, and dependency diagram live in
[`../architecture/api-map.md`](../architecture/api-map.md). This folder is the home for
deeper per-area API references if/when they are needed.

## Current API surface (all Next.js Route Handlers)

- **Auth:** Supabase Auth (Email OTP + Google OAuth) — no custom route.
- **Users:** `POST /api/account/delete-athlete-data`,
  `POST /api/mobile/account/delete-athlete-data`
- **Teams:** `/api/teams/[teamId]/{status,payment,members}`
- **Matches:** `/api/match-results`, `/api/match-results/[id]/void`
- **Tournaments:** `/api/tournaments`, `/api/tournaments/[id]`,
  `/api/tournaments/[id]/teams`
- **Media/Highlights:** `/api/highlights/[id]/{media,moderate,report}`
- **Payments:** `/api/payments/[id]/{confirm,slip}`
- **Team members:** `/api/team-members/[id]`
- **Reference:** `/api/provinces`, `/api/provinces/[id]`, `/api/regions`

## Conventions

- Auth: Web routes use the Supabase session cookie; Mobile routes accept the user's
  Supabase bearer token and preserve the same RLS identity. `middleware.ts` guards
  `/dashboard`, `/admin`, `/profile`.
- Safe writes go through `security definer` RPC functions (`record_match_result_safely`,
  `confirm_payment_safely`, `register_team_safely`, `void_match_result_safely`,
  `invite_team_member`).
- Rate limiting via `lib/rate-limit.ts` (Upstash, in-memory fallback).
- All high-risk actions emit structured logs via `lib/monitoring.ts`.

See [`../architecture/api-map.md`](../architecture/api-map.md) for the dependency
diagram and the cross-cutting concerns.
