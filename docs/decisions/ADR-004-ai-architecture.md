# ADR-004 — AI Architecture

**Status:** Deferred / PLANNED (not adopted)
**Date:** 2026-08-30

## Context
The brief describes AI Chat, AI Analysis, Computer Vision for match footage,
Recommendation, Scouting, and Prediction. A source search found **no AI code** in the
repository (only PromptPay payments and agent tooling references).

## Decision
**Do not build AI yet.** Treat all six subsystems as PLANNED. When adopted, any
AI-derived performance data must pass an **organizer verification** step before it
touches `player_ratings` / `athlete_progress` / `athlete_badges`, so it feeds the
existing verified-result integrity chain rather than bypassing it.

## Alternatives
- Build CV match analysis now: rejected — no model, no pipeline, high cost, and highest
  minor-privacy risk.
- Use an LLM to auto-write player ratings: rejected — breaks the audited rating system.
- Rule-based recommendation/prediction only: acceptable future path, still PLANNED.

## Reason
Shipping AI before real users and before the verified-result model is proven would add
cost and privacy risk without a validated need. Minors' footage/profile data makes AI
the most sensitive area in the product.

## Consequences
- Pros: no premature cost, no child-data exposure, no architecture churn.
- Cons: no AI features yet (acceptable per product stage).
- Guardrails for later: server-side secret storage for provider keys; private processing;
  retention limits; no training on children's data without lawful basis; reuse
  `lib/rating.ts`. Update `../architecture/ai-architecture.md` and this ADR when started.
