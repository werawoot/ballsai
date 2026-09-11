# ADR-006 - Mobile-led Multi-client Architecture

**Status:** Accepted
**Date:** 2026-09-03
**Supersedes:** ADR-003

BallDoenSai will launch with an Expo React Native athlete-first client for iOS and
Android while retaining the Next.js Web application for organizer, coach, scout, admin
and data operations. Both clients share Supabase Auth, Postgres and the existing
verified-result integrity chain; the Mobile app is a thin client and does not introduce
a separate backend, rating engine or identity model. This accepts two Store release
pipelines in exchange for mobile notifications and daily athlete engagement, while one
Expo codebase produces both platform binaries.

The domain is multi-sport: one Athlete Identity may own several Sport Profiles, but
Power Rating and Ranking remain scoped by sport and competition context. Football is
the operational pilot, futsal follows after the core loop is proven, and additional
sports require their own metrics and data source.
