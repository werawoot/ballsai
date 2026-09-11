# Entity Relationship Diagram — BallDoenSai.com

**Status:** updated **6 September 2026**, verified against `sql/*`.

This ERD is built **only** from schema that exists in the repository. A critical
finding: the DDL for five core tables (`profiles`, `tournaments`, `teams`,
`player_ranks`, `payments`) is **not present in any `sql/` migration file** — they
were created directly in the Supabase dashboard. Their columns below are **inferred**
from RLS policies, RPC code, and the Next.js route handlers (evidence cited). Treat
inferred columns as *documented assumptions*, not verified schema. See `../data/README.md`.

## ER Diagram

```mermaid
erDiagram
  auth_users {
    uuid id PK
    text email
  }
  profiles {
    uuid id PK
    text email
    text full_name
    text role "user|organizer|admin"
    text phone
    text province
    text team
    text position
    text onboarding_persona
    text onboarding_sport
    text onboarding_goal
    timestamptz onboarding_completed_at
    timestamptz updated_at
  }
  tournaments {
    uuid id PK
    uuid organizer_id FK
    text name
    text fee
    text promptpay
    text province
    date start_date
    date end_date
    text status "open|closed"
    int max_teams
  }
  teams {
    uuid id PK
    uuid tournament_id FK
    uuid created_by FK
    text name
    text members "free text"
    text status "pending|confirmed|rejected"
  }
  payments {
    uuid id PK
    uuid team_id FK
    uuid user_id FK
    uuid tournament_id FK
    text status "pending|confirmed"
    text slip_url "storage object path"
  }
  player_ranks {
    uuid id PK
    uuid player_id FK
    text player_name
    text sport
    text season
    int pts "Power Rating"
    int ovr
    int rank_change
    text position
  }
  athlete_profiles {
    uuid user_id PK FK
    text display_name
    date birth_date
    text sport
    text position
    text province
    int height_cm
    numeric weight_kg
    text current_team
    text bio
    text profile_image_url
    timestamptz guardian_consent_at
    bool is_public
    text verification_level "self|coach_verified|performance_verified"
  }
  athlete_videos {
    bigint id PK
    uuid athlete_id FK
    text title
    text video_url
    text video_type
  }
  athlete_achievements {
    bigint id PK
    uuid athlete_id FK
    text title
    text event_name
    text proof_url
    text verification_status
    text identity_badge_key
  }
  athlete_skill_assessments {
    bigint id PK
    uuid athlete_id FK
    text season
    smallint speed
    smallint stamina
    smallint strength
    smallint technique
    smallint vision
    text source_level
  }
  player_ratings {
    uuid id PK
    uuid player_id FK
    uuid player_rank_id FK
    text sport
    text season
    int power_rating
    int matches_played
    int wins
    int goals
    int assists
    text confidence "provisional|active|full"
  }
  rating_events {
    uuid id PK
    uuid player_rating_id FK
    uuid match_id FK
    text result "win|draw|loss"
    int rating_before
    int rating_after
    int rating_change
  }
  match_results {
    uuid id PK
    uuid tournament_id FK
    uuid team_a_id FK
    uuid team_b_id FK
    int team_a_score
    int team_b_score
    text status "confirmed|void"
  }
  match_player_performances {
    uuid id PK
    uuid match_result_id FK
    uuid player_rank_id FK
    uuid team_id FK
    text result
    int rating_before
    int rating_after
    int goals
    int assists
    bool mvp
    uuid team_membership_id FK
    timestamptz membership_verified_at
  }
  athlete_progress {
    uuid athlete_id PK FK
    int xp_total
    smallint current_level
  }
  athlete_xp_events {
    uuid id PK
    uuid athlete_id FK
    text event_key
    text event_type
    smallint xp_amount
    uuid source_rating_event_id FK
  }
  athlete_badges {
    uuid athlete_id PK FK
    text badge_key PK
    uuid source_rating_event_id FK
  }
  hall_of_fame_entries {
    uuid id PK
    text season
    text category
    text age_group
    uuid athlete_id FK
    uuid player_rank_id FK
    text athlete_name
  }
  athlete_highlights {
    bigint id PK
    uuid athlete_id FK
    text media_path UK
    text media_type "image|video"
    text moderation_status "visible|hidden"
  }
  athlete_highlight_reports {
    bigint id PK
    bigint highlight_id FK
    uuid reporter_id FK
    text reason
  }
  notifications {
    uuid id PK
    uuid user_id FK
    text notification_type "match_result|badge_earned|team_status|team_invite"
    text title
    text body
    text href
    text source_key UK
    timestamptz read_at
  }
  team_members {
    uuid id PK
    uuid team_id FK
    uuid athlete_id FK
    uuid invited_by FK
    text status "pending|accepted|declined|removed"
    text direction "invite|request"
    timestamptz accepted_at
    timestamptz removed_at
    uuid removed_by FK
    text removed_reason
  }
  account_deletion_requests {
    bigint id PK
    uuid user_id FK
    text email
    timestamptz requested_at
    timestamptz completed_at
  }

  auth_users ||--o| profiles : "trigger"
  profiles ||--o{ player_ranks : "linked"
  profiles ||--o| athlete_profiles : "1 athlete"
  profiles ||--o{ team_members : "invite"
  tournaments ||--o{ teams : "has"
  tournaments ||--o{ payments : "has"
  tournaments ||--o{ match_results : "has"
  teams ||--o{ payments : "paid by"
  teams ||--o{ match_results : "a/b"
  teams ||--o{ team_members : "roster"
  team_members ||--o{ match_player_performances : "verified membership"
  payments ||--o| teams : "confirms"
  player_ranks ||--o{ player_ratings : "rating"
  player_ranks ||--o{ hall_of_fame_entries : "award"
  athlete_profiles ||--o{ athlete_videos : "uploads"
  athlete_profiles ||--o{ athlete_achievements : "earns"
  athlete_profiles ||--o{ athlete_skill_assessments : "assessed"
  athlete_profiles ||--o{ athlete_highlights : "uploads"
  athlete_profiles ||--o| athlete_progress : "identity"
  athlete_profiles ||--o{ athlete_xp_events : "earns"
  athlete_profiles ||--o{ athlete_badges : "earns"
  player_ratings ||--o{ rating_events : "history"
  match_results ||--o{ match_player_performances : "per player"
  match_results ||--o{ rating_events : "source"
  athlete_highlights ||--o{ athlete_highlight_reports : "reported"
  auth_users ||--o{ account_deletion_requests : "request"
```

## Legend

- **Verified entities**: DDL exists in `sql/*` (athlete_profiles, player_ratings,
  match_results, athlete_progress, athlete_badges, notifications, team_members,
  hall_of_fame_entries, athlete_highlights, athlete_highlight_reports,
  account_deletion_requests, athlete_videos, athlete_achievements,
  athlete_skill_assessments, rating_events, match_player_performances).
- **Inferred entities** (`profiles`, `tournaments`, `teams`, `player_ranks`,
  `payments`): referenced everywhere, columns inferred from RLS + route code. **DDL is
  not in the repo** — see `../data/README.md` for the gap and recommended fix.

## Storage buckets (not tables)

| Bucket | Public | Purpose | Created by |
| --- | --- | --- | --- |
| `slips` | private (manual) | Payment slip images | **manual** in Storage UI |
| `athlete-avatars` | public | Profile photos (5 MB) | `athlete-profile-v2.sql` |
| `athlete-highlights` | private | Highlight media (25 MB) | `athlete-highlight-uploads-v1.sql` |

## Cardinality notes

- One `auth.users` to one `profiles` (trigger `on_auth_user_created`).
- One `athlete_profiles` per user (PK = `user_id`).
- `player_ratings` is one row per `(player_rank_id, sport, season)`.
- `match_results` references two `teams` (team_a, team_b), checked not equal.
- `rating_events` is the source of all XP/Badge via DB trigger.

## Applied And Pending Extensions

`sql/19-athlete-sport-profiles-v1.sql`,
`sql/20-guardian-verification-v2.sql`, and
`sql/21-sport-scoped-identity-v1.sql` are applied in Supabase project
`hivedzrwrrcnjrlirhtv`, introducing `athlete_sport_profiles`, sport-scoped
progress/XP/Badges, and private guardian request/consent/event tables. The diagram
remains intentionally conservative until the new tables and RLS are verified with real
JWTs; see the
[multi-sport specification](../product/multi-sport-guardian-verification-spec.md).
