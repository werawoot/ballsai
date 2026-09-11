# Architecture — BallDoenSai.com (Master)

**Status:** updated **3 September 2026**. This folder is the **single source of truth** for
the technical architecture. It is written for both humans and AI coding agents. Every
diagram is derived from the actual repository (`sql/*`, `app/**`, `lib/**`); nothing is
invented.

## 1. System Overview

BallDoenSai.com is a **Digital Sports Identity** platform for Thai youth footballers.
A single **Next.js 14 modular monolith** on Vercel uses **Supabase** (Auth, Postgres +
RLS, Storage, RPC) as a Backend-as-a-Service. The platform turns a verified match
result into a Player Card, Power Rating, XP, Badge, Career Timeline, Highlight and Hall
of Fame. Users are minors, their guardians, coaches, scouts, and tournament organizers.

- **No microservices.** The external Expo app now has an implemented Auth foundation;
  real-account integration and Store releases remain PLANNED under ADR-006.
- **No AI/ML** implemented — see `ai-architecture.md` (all PLANNED).

## 2. Architecture Diagram

- C1 System Context: [system-context.md](system-context.md)
- C2/C3 Containers & Components: [system-architecture.md](system-architecture.md)

## 3. Data Flow

[Data-flow.md](data-flow.md) — registration, profile, team, tournament, match, result,
performance, video, ranking, XP (BDS Points), notification. AI Analysis flow is marked
PLANNED.

## 4. AI Architecture

[ai-architecture.md](ai-architecture.md) — full inventory, all PLANNED/UNKNOWN, with a
privacy/cost checklist. No AI code exists.

## 5. Data Model (ERD)

[erd.md](erd.md) — entities, PK/FK, relationships. Five core tables
(`profiles`, `tournaments`, `teams`, `player_ranks`, `payments`) have **no DDL in the
repo**; see [../data/README.md](../data/README.md).

## 6. API

[api-map.md](api-map.md) — all Next.js route handlers, grouped, with dependency diagram.

## 7. Deployment

[deployment.md](deployment.md) — Vercel + Supabase; CI via GitHub Actions; DNS/domain
PLANNED; Sentry/PostHog PLANNED.

## 8. Architecture Decisions (ADR)

[../decisions/README.md](../decisions/README.md) — ADR-001..006.

The approved Mobile-led product definition lives in
[`../product/README.md`](../product/README.md). It describes target state and must not be
read as evidence that PLANNED components are implemented.

## 9. Governance rules

[governance.md](governance.md) — required update discipline for any architecture change.

## Document index

| Document | Purpose |
| --- | --- |
| [system-context.md](system-context.md) | C1 — actors & external systems |
| [system-architecture.md](system-architecture.md) | C2/C3 — containers & components |
| [data-flow.md](data-flow.md) | End-to-end data flows |
| [sequence.md](sequence.md) | 9 sequence diagrams |
| [erd.md](erd.md) | Entity relationship diagram |
| [deployment.md](deployment.md) | Deploy & infra |
| [api-map.md](api-map.md) | API inventory + dependencies |
| [ai-architecture.md](ai-architecture.md) | AI (all PLANNED) |
| [governance.md](governance.md) | Change-control rules |

## Status legend used across docs

- **EXISTING** — implemented and present in code/SQL.
- **PLANNED** — intended, with a design, but not built.
- **UNKNOWN** — not enough evidence; do not assume.
