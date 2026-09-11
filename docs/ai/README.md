# AI Documentation Index — BallDoenSai.com

The AI architecture document is
[`../architecture/ai-architecture.md`](../architecture/ai-architecture.md).

## Current state

**No AI, ML, LLM, or computer-vision code exists in the repository.** Every subsystem
(AI Chat, AI Analysis, Computer Vision, Recommendation, Scouting, Prediction) is
**PLANNED / UNKNOWN**. The only "prompt" in the codebase is **PromptPay** (manual
Thai bank transfer), and "anthropic/skills" is agent tooling, not a product feature.

## Guardrails for future AI work

1. Any AI that derives performance data must pass an **organizer verification** step
   before touching `player_ratings` / `athlete_progress` / `athlete_badges`, preserving
   the verified-result integrity chain.
2. Minors' data (footage, profiles) requires explicit consent, private processing, and
   retention limits; do not train models on children's data without lawful basis.
3. AI provider keys must live in server-side secret storage and never reach the client.
4. Reuse `lib/rating.ts` math; do not re-implement the rating system.
5. When any subsystem becomes EXISTING, update `ai-architecture.md` and add an ADR
   (`../decisions/ADR-004-ai-architecture.md`).
