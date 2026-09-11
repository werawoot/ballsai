# ADR-001 — Architecture Style

**Status:** Accepted
**Date:** 2026-08-30

## Context
BallDoenSai.com must be built and evolved by a solo Founder plus AI coding agents, and
scale later. We needed a style that minimizes operational surface area, keeps data
integrity centralized, and is easy for an agent to reason about without distributed
debugging.

## Decision
Adopt a **Modular Monolith**: a single Next.js 14 App Router application on Vercel that
uses **Supabase as a Backend-as-a-Service** (Auth, Postgres + RLS, Storage, DB
functions). Business-critical writes go through `security definer` RPC functions
(`record_match_result_safely`, `confirm_payment_safely`, `register_team_safely`,
`void_match_result_safely`). Derived identity data (XP, Badge, Ranking) is computed in
Postgres triggers, not in the app.

We explicitly **do not** split into microservices.

## Alternatives
- Microservices / separate API + worker tier: more moving parts, harder for a solo
  operator and for agents to keep consistent; rejected for now.
- Self-hosted backend (Node + own DB): higher ops cost; rejected.
- Client-side rating/XP computation: bypassable, not auditable; rejected.

## Reason
A monolith on a managed BaaS keeps one deployable, one datastore, and enforces
integrity where the data lives (RLS + triggers). It is the cheapest to operate and the
easiest for an AI agent to navigate (one repo, clear modules under `app/` and `lib/`).

## Consequences
- Pros: low ops burden, strong server-side integrity, simple mental model.
- Cons: scaling bottlenecks are solved later inside the monolith; no independent
  deployment of features. If scale demands, extract a service behind the existing RPC
  boundary (the RPC interface already hides the DB).
- Agents must respect the RPC/trigger boundary and not introduce direct client writes
  for rating/XP/payment/team.
