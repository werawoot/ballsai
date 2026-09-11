# MVP Delivery Plan

**Goal:** prove the verified-result return loop with 5-20 real athletes in one football
competition, on iOS and Android from one Expo codebase.

## Release 0 - Readiness

- Confirm pilot organizer, competition and athlete cohort.
- Create Apple Developer and Google Play Console accounts.
- Capture missing core-table DDL so environments are reproducible.
- Define mobile bearer-session support and deep-link redirects.
- Instrument consent, result SLA, notification delivery and retention events.
- Obtain legal review of age, consent, privacy and AI Training policies.

Exit: test environments are reproducible and one real organizer owns the 24-hour result
SLA.

## Release 1 - Identity And Read Experience

- Mobile authentication foundation (implemented; real-account verification pending)
- onboarding (planned)
- Athlete Identity and Sport Profile selection
- private-by-default Minor Athlete flow
- Player Card and STARTER state
- competition, match and Verified Result views
- Rating, XP and scoped Ranking read views

Exit: one test athlete can complete onboarding and understand the provenance of every
displayed metric on both iOS and Android.

## Release 2 - Return Loop

- push token registration and notification preferences
- result-confirmed push with authenticated deep link
- progress change explanation
- analytics for result-to-notification and return behavior
- offline and stale-data handling

Exit: a confirmed result reaches at least 90% of pilot athletes within 24 hours and the
deep link opens the correct result.

## Release 3 - AI Training And Coach Review

- server-side AI Training Recommendation
- safety policy, provenance and output storage
- training focus plus light drill, duration and repetitions
- coach mobile review and full Web review queue
- Guardian gate for Minor Athlete access
- rejection, edit and incident feedback paths

Exit: every recommendation is traceable, unsafe categories are blocked, intensive advice
cannot bypass Coach Review and AI failures do not block the rest of the app.

## Release 4 - Store And Closed Beta

- TestFlight and Google Play testing submitted together
- iPhone plus Android mid/low-tier real-device checks
- privacy labels, data-safety forms, age rating and review notes
- crash, API, database, push and AI-cost monitoring
- support and rollback runbooks

Exit: five testers complete the full flow on real data. Public submissions may be sent
together; release dates may differ when Store review differs.

## Test Matrix

| Area | Required evidence |
| --- | --- |
| Identity | adult, age 13-19 + Guardian, under 13 Guardian-managed |
| Roles | Athlete, Coach, Guardian, Organizer permission boundaries |
| Platforms | current iPhone, Android mid/low tier, poor network |
| Integrity | no client write to Rating, XP, Badge or Verified Result |
| Privacy | private default, withdrawal, deletion, public-field filtering |
| AI | provenance, safety blocks, Coach Review, provider failure |
| Operations | result entry, correction/void, audit and notification |

## Explicitly Not In MVP

Social feed, challenges, opportunities, video analysis, injury diagnosis, career
prediction, national-ranking claims, a BDS currency and third-sport operations.
