# Product Strategy And Roadmap

**Decision:** BallDoenSai launches **Mobile-led, data-first, and Web-supported**.

The public athlete experience leads on iOS and Android. Web remains essential from day
one for organizers, coaches, scouts, administrators and data operations. The product is
not a responsive website wrapped as an app; both clients use one identity, one data
model and one verified-result integrity chain.

## Product Thesis

BallDoenSai wins when a real competition creates trusted athlete data quickly enough to
bring an athlete back. The initial loop is:

```text
Organizer confirms result
  -> Rating, XP and Ranking update from the verified-result chain
  -> Athlete receives a notification
  -> Athlete sees progress and the next training focus
  -> Athlete shares or returns after the next verified event
```

Mobile is the right lead client for notifications, Player Cards, progress and short
training actions. Web is the right operational client for tournament setup, rosters,
bulk result entry, coach assessment, moderation and intelligence dashboards.

## Initial Market

- Brand: DoenSai is multi-sport; BallDoenSai starts with football and futsal.
- Operational pilot: one football competition that the team can support directly.
- Closed Beta: 5-20 athletes selected from that competition.
- Expansion: futsal follows after the football core loop works; a third sport follows
  only after its data supplier and sport-specific model are ready.
- Architecture is multi-sport from the start; operations are deliberately single-sport
  during the first proof.

## Core MVP

- Login and onboarding
- Athlete Identity plus separate Sport Profiles
- sport-specific Player Card
- competition and match feed
- Verified Results
- competition + age group + sport + season Ranking
- Power Rating and XP from Verified Results only
- push and in-app notifications
- AI Training Recommendation for training focus and light drills
- Coach Review on mobile; full coach and organizer operations on Web
- Guardian consent and private-by-default profiles for Minor Athletes

Deferred until the core loop is proven: social feed, challenges, opportunities, AI
Coach, video analysis, health diagnosis, career prediction, cross-sport scoring and a
spendable BDS Points economy.

## Business Model

The first likely payer is the organizer, for registration plus verified result and
ranking operations. Athletes receive identity and progress value. Paid placement must
never alter Rating, Ranking, XP or verification.

## Success Measures

Closed Beta passes only when all three conditions hold:

| Measure | Initial gate |
| --- | ---: |
| Week-over-week athlete return | at least 60% |
| Verified Results visible in the app within 24 hours | at least 90% |
| Organizer completes the core workflow without live assistance | yes |

Guardrails: crash-free sessions, consent completion, notification delivery, support
volume, incorrect-result rate and AI recommendation rejection rate.

## Roadmap

### Phase 0 - Foundation

Resolve reproducible database DDL, mobile authentication, role authorization, event
tracking, consent records, push infrastructure and Store accounts. Confirm the real
pilot organizer and athlete cohort.

### Phase 1 - Closed Beta

Ship one Expo codebase to TestFlight and Google Play testing. Operate one football
competition, enter every result within 24 hours and measure the full return loop.

### Phase 2 - Operational Independence

Make organizer result entry and coach review self-serve. Improve audit, support,
monitoring and rate limits until the pilot no longer depends on founder intervention.

### Phase 3 - Public Football Launch

Submit iOS and Android together while allowing Store approval dates to differ. Expand
competition by competition, not through an unrestricted national-ranking claim.

### Phase 4 - Futsal, Then Multi-Sport

Add a distinct futsal Sport Profile and ruleset. Add a third sport only with a real data
partner, sport-specific metrics and a completed integrity review.
