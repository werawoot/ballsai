# Sequence Diagrams — BallDoenSai.com

**Status:** updated **30 August 2026**. Each diagram reflects the **actual code path**
in `app/api/**` and `sql/*`. Flows not yet implemented are marked `[PLANNED]`.

## 1. User Login

```mermaid
sequenceDiagram
  actor U as User
  participant B as Browser
  participant MW as middleware.ts
  participant SB as Supabase Auth
  U->>B: /login (Email OTP or Google)
  B->>SB: signInWithOtp / OAuth
  SB-->>B: session cookie
  B->>MW: next request
  MW->>SB: auth.getUser()
  SB-->>MW: user or null
  alt protected route & no user
    MW-->>B: redirect /login?next=...
  else ok
    MW-->>B: continue
  end
```

**Status:** EXISTING.

## 2. Player Registration (first visit)

```mermaid
sequenceDiagram
  actor U as User
  participant App as Next.js
  participant DB as Postgres
  U->>App: /welcome (persona=athlete, sport, goal)
  App->>DB: update profiles.onboarding_*
  DB->>DB: handle_new_user already created profiles
  alt athlete persona & no athlete_profiles
    App->>DB: insert athlete_profiles
    DB->>DB: trigger create_rookie_identity -> xp=50, badge=rookie
  end
```

**Status:** EXISTING.

## 3. Join Team

```mermaid
sequenceDiagram
  actor P as Player
  participant API as /api/teams/[id]/status or register
  participant SB as Supabase
  participant DB as Postgres (RPC register_team_safely)
  P->>API: register team (tournament, name, members)
  API->>SB: auth.getUser + role
  API->>DB: rpc register_team_safely
  DB->>DB: lock tournament row, check open & not already registered
  DB-->>API: team_id (status=pending)
  API-->>P: ok
```

**Status:** EXISTING. Roster `members` is free text today.

## 4. Tournament Registration (team + slip)

```mermaid
sequenceDiagram
  actor P as Player
  participant API as /api/teams/[id]/payment
  participant Store as Supabase Storage (slips, private)
  participant DB as Postgres (payments)
  P->>API: upload slip + create payment
  API->>Store: insert object <user>_<team>_<ts>.<ext>
  API->>DB: insert payments (status=pending, slip_url=path)
  Note over API: duplicate payment per team blocked by unique index
  API-->>P: ok
  Organizer->>API: /api/payments/[id]/confirm
  API->>DB: rpc confirm_payment_safely -> payments=confirmed, teams=confirmed
  API->>Resend: team status email (if configured)
```

**Status:** EXISTING.

## 5. Submit Match Result

```mermaid
sequenceDiagram
  actor O as Organizer
  participant API as /api/match-results
  participant Rate as lib/rating.ts
  participant DB as Postgres (rpc record_match_result_safely)
  O->>API: POST {tournament, teamA, teamB, scores, performances, mode}
  API->>API: auth + role check (organizer/admin)
  API->>Rate: calculateRating per player (preview)
  alt mode=preview
    API-->>O: preview only
  else mode=confirm
    API->>DB: rpc record_match_result_safely
    DB->>DB: insert match_results, rating_events, match_player_performances, update player_ratings/player_ranks
    DB-->>API: match_result_id
    API->>API: revalidateTag('public-ranking')
    API-->>O: ok
  end
```

**Status:** EXISTING.

## 6. Upload Video

```mermaid
sequenceDiagram
  actor A as Athlete
  participant API as /api/highlights/[id]/media
  participant Store as Supabase Storage (athlete-highlights, private)
  participant DB as Postgres (athlete_highlights)
  A->>API: upload media
  API->>Store: insert object <user>/...
  API->>DB: insert athlete_highlights(media_path, media_type)
  DB-->>API: ok (served only to owner/admin/public-profile)
```

**Status:** EXISTING.

## 7. AI Training Recommendation - NOT IMPLEMENTED

```mermaid
sequenceDiagram
  actor A as Athlete
  participant API as Authenticated API (PLANNED)
  participant DB as Postgres
  participant AI as AI Service (UNKNOWN provider)
  actor C as Coach
  A->>API: request training recommendation
  API->>DB: load permitted profile + verified data
  API->>AI: structured, minimized context
  AI-->>API: training focus + light drill
  API->>API: apply safety policy + record provenance
  alt general or light
    API-->>A: recommendation + source status
  else higher intensity
    API-->>C: Coach Review required
    C->>API: approve, edit or reject
    API-->>A: reviewed recommendation
  end
```

**Status:** PLANNED. No AI service, endpoint or review storage exists. AI output cannot
write Rating, XP, Badge or Verified Result data. See `ai-architecture.md`.

### Later AI: Video Analysis

```mermaid
sequenceDiagram
  actor O as Organizer (future)
  participant Vid as Video (Storage)
  participant AI as Computer Vision Service (UNKNOWN)
  participant DB as Postgres
  O->>Vid: uploaded match footage
  Vid->>AI: (PLANNED) CV pipeline
  AI-->>DB: (PLANNED) performance events
  Note over DB: must go through organizer-verified match result before touching rating
```

**Status:** UNKNOWN / PLANNED. This is not part of the Mobile MVP.

## 8. Ranking Update

```mermaid
sequenceDiagram
  participant RPC as record_match_result_safely
  participant PR as player_ratings
  participant PRK as player_ranks
  participant Cache as Next revalidateTag
  RPC->>PR: update power_rating, matches/wins/goals...
  RPC->>PRK: update pts, ovr, rank_change
  RPC-->>Cache: public-ranking invalidated
  Note over Cache: /ranking reflects new values on next request
```

**Status:** EXISTING.

## 9. BDS Points (XP) Reward

```mermaid
sequenceDiagram
  participant RE as rating_events (insert)
  participant Trig as trigger sync_athlete_identity_from_rating_event
  participant XP as athlete_xp_events
  participant AP as athlete_progress
  participant AB as athlete_badges
  RE->>Trig: after insert
  Trig->>XP: insert match/win/goal/assist/clean_sheet/mvp events
  Trig->>AP: sum xp -> xp_total, current_level
  Trig->>AB: insert earned badges (first_match, goal_hunter, ...)
  AB->>Trig2: trigger notify_badge_earned -> notifications
```

**Status:** EXISTING.
