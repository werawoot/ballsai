# ADR-016: Running mode, version 1

Status: agreed scope (owner, 25 Nov 2026), not built yet.

## Context

The owner wants a running mode in DOENSAI that everyone can use, and will use it to lose
weight themselves ("ฟีเจอร์ใหม่ให้ทุกคนใน DOENSAI"). DOENSAI's users include minors. Under PDPA a
person's weight is health data, a sensitive category. The app already has `/training` (programmes,
check-ins, self-tests), `/progress`, and `athlete_profiles.weight_kg`, which today is a public column
(`PUBLIC_PROFILE_COLUMNS` in `lib/athlete-private.ts`) shown on `/players/[id]`, for children too.

## Decisions (owner, 25 Nov 2026, one question at a time)

| Question | Answer |
|---|---|
| Who may record weight and set a weight goal | Adults (18+) only. Children use running logs and consistency goals, with no weight-loss goal |
| How the app knows a person is 18+ | A tick "ฉันอายุ 18 ปีขึ้นไป". Default added in design: if the person's athlete profile has a birth date under 18, the database refuses the weight features even with the tick |
| Weight on the public athlete page | Hide it from the public page (separate small PR, before running mode) |
| Where running mode lives | A tab in `/training` (no new bottom-bar button) |
| XP or badges from self-logged runs | None in V1 (XP comes from verified match results; a self log is easy to inflate) |
| Who sees a child's running history | The child and their linked guardians. Not coaches |
| The weight section for adults | Log, chart, and an optional target; a gentle note when the target asks for more than 1 kg a week; no calories, no food |

## Version 1 builds

1. Log a run by hand: date, distance, time; pace is worked out. History, weekly totals. Source is
   `self` (AGENTS.md rule 8), never shown as performance.
2. A weekly goal in runs or km, and a streak of weeks met.
3. A beginner plan, 8 weeks of walk-run, on the existing training programme system.
4. Adults only: weight log, chart, optional target with the 1 kg/week note. Private to the owner.
5. Works alone straight away, for every role (product rule of 12 Oct 2026).
6. PDPA: runs and weights are in the data deletion of `/profile`; RLS owner (plus linked guardian for
   runs); a weight row is never public, never ranked, never shown to a coach.

## Version 1 does not build

GPS tracking during a run (a child's location, battery, screen on); Strava, Garmin or Apple Health;
calories or food; weight leaderboards or sharing; XP or badges from runs; medical advice.

## Open before building

- Order: the public-weight fix first (its own PR), then running mode, after PR #202 is merged so the
  PRs stay separate.
- The consent and privacy wording for weight (owner's rule: consent and PDPA text is not changed
  without the owner; a lawyer review is T25).
- Nationwide: runs grow fastest of any table (one row per run per person); list pages are paginated
  and indexed on (user, date) from the start.
