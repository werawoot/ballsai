# ADR-015 - Athlete MVP: self-development and training first

Status: **accepted in direction, details open** (owner, 8 Nov 2026)

## Context

On 8 Nov 2026 the owner looked at the athlete user flow (10 steps, sign-up to sharing the card) and
saw that most of it waits on other people: a guardian for a minor's public profile, a coach's
invitation for a team, an organizer for a confirmed result. Nothing in the competition loop has
happened with real users yet.

The owner then set the first launch to a smaller scope, with a reference image of four screens:

> "อย่าเพิ่งสร้าง DOENSAI ให้เป็น FIFA Ultimate Team ทั้งระบบ ให้เริ่มจากทำให้นักกีฬาอยากพัฒนาตัวเองก่อน
> แล้วค่อยทำให้การ์ดสะท้อนความสามารถที่พัฒนาขึ้นจริง"

The goal of the trial version: a young footballer signs up, knows how to improve, trains to a plan,
and comes back.

## Decision

### Scope of the MVP

| Feature | MVP |
| --- | --- |
| Sign-up, profile | must |
| Personal goal | must |
| Training programmes, by age and level | must |
| Record a finished session | must |
| See progress | must |
| Level from training | should |
| Player card, basic data only | should |
| AI skill analysis, OVR from AI | not now |
| Competitions, teams | not now (pages stay; they leave the athlete's main path) |

### User flow

1. Sign up or sign in.
2. Create the footballer profile.
3. Choose a self-development goal.
4. Choose a level and a training programme.
5. Train and record the session.
6. Earn points and see progress.
7. Set a new goal.

### Owner decisions (8 Nov 2026)

1. **Level comes from effort points** (แต้มขยัน, +50 a check-in), a training level kept apart from
   XP and Power Rating, which stay tied to confirmed match results.
2. **The athlete's bottom bar has four tabs**: Home · Training · Progress · Profile. The card and
   tournaments move under Profile; nothing is deleted.
3. **Self-tests** (before and after) are chosen from research by Claude first: three or four tests a
   child can do safely at home, each with a source like every drill, reviewed by the coach together
   with the programmes.

### Rules that hold

- Only data the athlete really records: minutes trained, skill trained, done or not, days in a row,
  self-test results before and after. A chart or a number appears only when that data exists, and
  every self-test number is labelled as self-recorded (AGENTS.md rule 8). The radar and "+12%" of
  the reference image are shown only once real test results exist.
- No weight training, and no fitness target without a source and a safe protocol for children.
- Pictures: real licensed photos or our own faceless 3D renders, never AI-generated people
  (AGENTS.md rule 7).

## What already exists

Sign-in with email codes (T17), the athlete home with today's missions and effort points, four
programmes by age band with weekday scheduling, the session (heat advice, pain check, drill
checklist, timers), check-ins, streaks, and `/me`.

## To build

1. A goal step (fixed choices, so progress can be measured). **Owner, 8 Nov 2026:** four goals
   (better ball control · stronger, fewer injuries · faster and more agile · train regularly),
   asked on `/training` before the programmes and changeable from `/progress`; SQL95.
2. Self-tests every four weeks, with results compared to the last one. **10 Nov 2026:** research in
   `docs/research/self-tests-2026-11-10.md` proposes preferred-foot juggling, plank hold and
   standing long jump; **owner chose all three on 10 Nov 2026**; awaiting the coach review
   (`docs/training/coach-review-pack.md`). **Owner, 11 Nov 2026:** built but hidden until the
   coach signs off (`/progress/tests`, shown only where `NEXT_PUBLIC_SELF_TESTS` is `true`);
   the athlete, an accepted guardian and an admin read results; entering again the same day
   corrects that day's result; careful defaults until the coach answers (plank stops at
   2 minutes, long jump from 12 with a birth date). Table and rules: SQL96.
3. A Progress page: training history and self-test results. **Owner, 12 Nov 2026:** an accepted
   guardian sees the same for their child, read only, at `/guardian/[athleteId]/progress` (linked
   from each accepted child on `/guardian`): goal, home sessions, the last eight weeks,
   programmes and, behind the same `NEXT_PUBLIC_SELF_TESTS` switch, the self-test results.
   Anyone without an accepted, consented link gets the 404 page.
4. After `/welcome`, an athlete goes to choosing a programme, not to `/card`.
5. The four-tab bottom bar.
6. A training level from effort points.

Each item gets its own test first (tdd) and its own PR. Anything needing a table is a new SQL
file, Staging first.

## Gates before real users (not code)

1. **Programme content is a draft "awaiting licensed coach review".** A licensed coach or
   physiotherapist signs off the programmes and the self-tests before children train with them.
2. **PDPA:** whether a minor's training data needs guardian consent from sign-up, not only for a
   public profile, is a legal question (T25).
3. **Backup (T29)** before real data arrives.

## Consequences

- The competition loop (ADR-011, results, Power Rating) stays in the code and keeps working; it
  is simply not where a new athlete is sent first.
- `docs/user-flows.md` §2 changes when the work ships.
