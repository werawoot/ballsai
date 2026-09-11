# ADR-003 — Mobile Architecture

**Status:** Superseded by ADR-006
**Date:** 2026-08-30

## Context
The brief mentions iOS and Android apps and a web client. The product is for youth
players, parents, coaches, and organizers who primarily use phones.

## Decision
**No native iOS/Android apps exist today.** The only client is the responsive Next.js
web app. Mobile is treated as **UNKNOWN / PLANNED**: if built, it will be a thin client
against the same Supabase + Next.js API (the route handlers are already the API surface),
not a separate backend.

## Alternatives
- React Native / Expo shared codebase: plausible future, but not started.
- Native Swift/Kotlin: higher cost; not justified yet.
- Separate mobile backend: rejected — would duplicate the verified-result integrity
  logic that lives in Postgres.

## Reason
Building native apps before the web flow is proven (Closed Beta W1) is premature. The
web app already serves mobile browsers and supports the native share sheet for Cards.

## Consequences
- Pros: no extra ops surface; one API to maintain.
- Cons: no app-store distribution yet; deep mobile features (push, offline) need a
  decision later.
- If mobile is started, reuse `app/api/**` and Supabase Auth; do not create a second
  auth or rating path. Add an ADR superseding this one.

This decision was superseded on 3 September 2026 after the Mobile-led product strategy
and separate Expo application were approved. See `ADR-006-mobile-led-multi-client.md`.
