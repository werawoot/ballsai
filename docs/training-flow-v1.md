# Training flow V1 — specification (approved 1 Oct 2026)

An athlete picks a training programme for their age band, sets the weekdays they train,
does each session from a checklist and checks it in. The system keeps the schedule and the
streak. Research: [`docs/research/youth-training-programmes-2026-10-01.md`](research/youth-training-programmes-2026-10-01.md)
(sections 1–5 and the Addendum).

```text
Athlete (U10–U17) opens "Training" from the card on /profile or the signed-in home
→ sees the programmes for their age band (A, B for U10–U13; C, D for U14–U17)
→ opens one: weeks, sessions/week, minutes, drills, and "Source / evidence"
→ starts it and picks weekdays (the scheduler keeps the rest days)
→ on a training day: heat level → "Any pain right now?" → drill checklist → "Done"
→ check-in recorded; XP and badges are self-reported and never touch Power Rating
```

Every programme shows **"Draft — awaiting coach review"** until a licensed coach signs it off.

## Built in V1 (SQL63 + app)

- `/training` (band from the athlete's age), `/training/<programme>`, `/start` (weekdays),
  `/session` (heat advice → pain gate → checklist with timers → "Done"),
  `/training/drills/<drill>` (picture, how-to, full provenance), and the card on `/profile`.
- Pictures: our own faceless 3D mannequin renders (`scripts/training-art/`, committed as
  WebP in `public/training/drills/`). Real photos or video can replace a picture later; they
  must follow rule 1 and, for any minor shown, carry guardian consent.
- Not yet: the card on the signed-in home page (home is redesigned only on purpose, AGENTS.md
  rule 7), reminders (needs notifications), coach assignments.

## Locked rules (owner, 1 Oct 2026)

### 1. Content and copyright

- **Allowed path:** research paper → read the evidence → extract the exercise idea → write our
  own Thai instruction → set our own progression → our own illustration and video.
- **Never shipped:** FIFA PDFs, videos, photos, illustrations, posters or logos; Knee Control+
  official media; any programme owner's media — unless permission is given separately in
  writing. Open-access research is not open-source media.
- **Names are ours.** A programme is a BallDoenSai programme (e.g. "BallDoenSai U10 Foundation
  #01"). FIFA 11+, 11+ Kids, Knee Control+ appear only in the "Source / evidence" section as
  citations, never as the programme name and never in a way that suggests endorsement.
- Illustrations are our own drawn characters, not photos of people (users are minors; photos
  carry image rights).

### 2. "Any pain right now?" before every session

- Two answers: **No pain → start** / **Pain → do not start**.
- On "Pain": show only *"If something hurts, stop training and tell your parent or coach."*
  The app never interprets or names an injury.
- **The answer is not stored** — not in the database, not in analytics. It is a gate only
  (PDPA: a minor's health data).

### 3. Access levels per drill and programme

| Level | Meaning | Who can start it |
|---|---|---|
| `solo` | Safe to do alone | The athlete chooses it |
| `partner` | Needs a training partner or coach present | Shown with a "with a partner" label; not in solo sessions |
| `coach_guided` | Needs a coach to assign it | Only after a coach assigns it |
| `restricted` | Not for self-training | Never shown in self-training |

Programme **E (hip and groin, U16–U17) is coach-assigned only** and is never offered for
self-selection. Nordic hamstring and Copenhagen adduction are `coach_guided` or `partner`,
never `solo`.

### 4. Wording must match the evidence

- Programme E is described as *"Adductor strength and mobility training studied in elite youth
  football players"*. Never "prevents groin injury": in the study the groin-pain difference
  (14.3% vs 28.6%) was not statistically significant.
- No programme claims a result its source did not show. Injury-reduction figures are quoted
  only for the programme they were measured on, with the source.

## Programmes (draft)

| Code | Band | Name (ours) | Goal | Weeks | Sessions/wk | Min | Access |
|---|---|---|---|---|---|---|---|
| A | U10–U13 | BallDoenSai U10 Foundation #01 — วอร์มอัพป้องกันบาดเจ็บ | Movement and injury-prevention warm-up | 8 | 2 | 15 | solo |
| B | U10–U13 | BallDoenSai U10 Ball Mastery #01 — บอลติดเท้า + คล่องตัว | Ball mastery and agility | 8 | 2–3 | 25–30 | solo (small game: partner) |
| C | U14–U17 | BallDoenSai U14 Prevention #01 — วอร์มอัพป้องกันบาดเจ็บ | Youth injury-prevention warm-up | 8 | 2–3 | 20 | solo; Nordic coach_guided |
| D | U14–U17 | BallDoenSai U14 Game Skills #01 — เทคนิคในเกม + ความเร็ว/ความแข็งแรง | Technique under variation, speed, bodyweight strength | 8 | 3 | 40–45 | solo; small games partner |
| E | U16–U17 | BallDoenSai U16 Hip & Groin #01 — สะโพกและขาหนีบ | Adductor strength and mobility | 8 | 2 | 20 | coach-assigned only |

Drill lists and sources: research note §4 and Addendum.

## Scheduler rules

- At least 2 rest days a week for U10–U13 and at least 1 for U14–U17.
- Strength days never back to back.
- Streaks count **planned sessions completed with rest days kept**, not consecutive days.
- Heat: show the day's level using the Thai Department of Health heat-index bands; at "danger"
  and above, suggest early morning or evening, or skipping.
- V1 does not ask club training hours (the "hours ≤ age" warning uses in-app sessions only).

## Data

**Content lives in the repo** as typed data (reviewed by pull request, versioned, no admin
form). Every drill carries these required fields:

```text
source_title, source_author, source_url, doi, license, commercial_use, adaptation_allowed,
attribution_text, source_media_license, modified_by_balldoensai, evidence_level,
age_range, access_level (solo | partner | coach_guided | restricted), partner_required,
coach_required, license_verified_at, license_verification_method
```

A build-time test fails if any drill misses a field, if a `solo` programme contains a
non-solo drill, or if a programme name contains "FIFA" or another owner's programme name.

**Athlete data** (new SQL file, Staging first, Production on separate approval):

- `training_enrollments` — athlete, programme code, weekdays, start date, status. One active
  enrollment per programme per athlete.
- `training_checkins` — athlete, enrollment, session date, completed drills. Unique per
  (enrollment, session date) so a retried "Done" never counts twice.
- `training_assignments` — coach → athlete (or team) → programme, for `coach_guided` content
  and programme E. **Not in SQL63**: until it exists, E and the Nordic exercise show as
  locked ("coach-assigned only") and cannot be started.
- RLS: the athlete reads and writes their own rows; an accepted guardian reads; a coach reads
  only what they assigned. Nothing is public. No pain answers anywhere.

XP for check-ins is self-reported (AGENTS.md rule 8) and never feeds Power Rating, rank or
any `performance_verified` label.
