# AI Architecture — BallDoenSai.com

**Status:** updated **3 September 2026**.

> ## Important: no AI exists in this codebase today
>
> A full source search of `*.ts`, `*.tsx`, `*.sql`, `*.json`, `*.md` found **zero**
> references to any AI model, LLM, computer-vision, speech, or ML service. The only
> matches for "prompt" are **PromptPay** (a Thai manual bank-transfer payment method),
> and "anthropic/skills" is agent tooling, not a product feature.
>
> Therefore **every** subsystem below is marked **PLANNED / UNKNOWN**. Nothing here is
> implemented. Do not present any of it as built. This document is a placeholder to
> capture the intended shape so future work has a starting point and a privacy/cost
> checklist.

## Design constraint carried from the current system

Whatever AI is added later **must** feed the existing verified-result model. Today the
chain is: `match_results` (organizer-confirmed) -> `rating_events` -> triggers ->
`player_ratings` / `athlete_progress` / `athlete_badges`. An AI that derives
performance must produce data that an organizer verifies before it touches rating or
XP, otherwise it bypasses the integrity guarantees the DB triggers enforce.

## Subsystem inventory

| Subsystem | Status | Intended role |
| --- | --- | --- |
| AI Chat | PLANNED / UNKNOWN | Conversational help for players/parents/organizers |
| AI Analysis | PLANNED / UNKNOWN | Summarize a player's season / passport |
| Computer Vision | PLANNED / UNKNOWN | Detect players, track, detect events from match video |
| AI Training Recommendation | PLANNED | Suggest an explainable training focus and light drill from permitted athlete data |
| Scouting | PLANNED / UNKNOWN | Surface talent to coaches/academies from public data |
| Prediction | PLANNED / UNKNOWN | Forecast match/player outcomes from ratings |

---

## 1. AI Chat

| Aspect | Value |
| --- | --- |
| Input | User question + (optionally) their profile/role context |
| Processing | UNKNOWN - LLM orchestration not built |
| Model | UNKNOWN - no provider selected (no OpenAI/Anthropic/etc. in deps) |
| Output | Natural-language answer |
| Storage | UNKNOWN - likely Supabase or none |
| API | UNKNOWN - no route handler exists |
| Cost considerations | UNKNOWN (per-token LLM cost; must stay free-tier friendly for a youth product) |
| Privacy considerations | Must not expose minors' PII; must respect is_public + guardian consent; logs must avoid storing chat content of children |

## 2. AI Analysis

| Aspect | Value |
| --- | --- |
| Input | athlete_profiles, player_ratings, athlete_progress, match_player_performances |
| Processing | UNKNOWN |
| Model | UNKNOWN |
| Output | Narrative summary / insights for Career Passport |
| Storage | UNKNOWN - could extend athlete_achievements or a new table |
| API | UNKNOWN |
| Cost considerations | Cheap if run on-demand per profile view; cache recommended |
| Privacy considerations | Same minor-protection rules; output must match verification_level (self/coach/performance) |

## 3. Computer Vision (match footage)

| Aspect | Value |
| --- | --- |
| Input | Match video (today stored in athlete-highlights private bucket or external URLs) |
| Processing | PLANNED - player detection then tracking then event detection (goals, assists, saves) |
| Model | UNKNOWN - no CV framework in package.json |
| Output | Structured performance events (goals, assists, clean sheet, mvp, save pct) |
| Storage | Would land in match_player_performances / rating_events **only after organizer verification** |
| API | UNKNOWN |
| Cost considerations | Video inference is expensive (GPU/time); needs a clear cost model before build |
| Privacy considerations | **Highest risk**: footage of minors. Requires explicit consent, private processing, retention limits, and no model training on children's data without lawful basis |

## 4. Recommendation

| Aspect | Value |
| --- | --- |
| Input | Permitted profile fields, sport, position, verified performance and Coach Assessment |
| Processing | PLANNED server-side generation plus deterministic safety policy |
| Model | UNKNOWN - provider not selected |
| Output | Training focus plus optional light drill, duration and repetition range |
| Storage | PLANNED - output, input provenance, model/policy version and review status |
| API | PLANNED - authenticated server endpoint; provider key never reaches Mobile |
| Cost considerations | Generate on data change or request, cache by data version and rate limit |
| Privacy considerations | Guardian gate for Minor Athletes; no diagnosis, career prediction or inference of missing health data |

General recommendations may be displayed with source and AI status. Higher-intensity
recommendations require a recorded Coach Review before the Athlete sees them. AI output
never writes Power Rating, XP, Badge or Verified Result data.

## 5. Scouting

| Aspect | Value |
| --- | --- |
| Input | Public rankings, highlights, achievements |
| Processing | UNKNOWN - likely filter + ranking, optionally ML scoring |
| Model | UNKNOWN |
| Output | Shortlist of athletes for a coach/academy |
| Storage | UNKNOWN |
| API | UNKNOWN |
| Cost considerations | UNKNOWN |
| Privacy considerations | Scouting minors is sensitive; surface only is_public profiles; provide guardian opt-out |

## 6. Prediction

| Aspect | Value |
| --- | --- |
| Input | player_ratings (Elo-style), history |
| Processing | UNKNOWN - could be statistical, not ML |
| Model | UNKNOWN |
| Output | Win probability / trajectory |
| Storage | UNKNOWN |
| API | UNKNOWN |
| Cost considerations | Low (pure math on existing ratings) |
| Privacy considerations | Output must not reveal private athlete context |

---

## Open decisions before any AI work (recommended ADR)

1. **Provider & keys:** where do API keys live? App currently holds no service-role/secret
   beyond Resend/Upstash; AI keys need a secret store and must never reach the client.
2. **Verification gate:** AI-derived performance must pass an organizer before touching
   rating/XP (preserves current integrity).
3. **Minor privacy:** lawful basis, consent, retention, and no-training-on-children rules.
4. **Cost ceiling:** per-action budget; cache aggressively.
5. **No duplication:** reuse lib/rating.ts math rather than re-implementing rating.

See `../decisions/ADR-004-ai-architecture.md`.
