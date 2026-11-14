# Browser end-to-end check (athlete flow)

`npm run test:e2e` (`scripts/e2e/athlete-flow.mjs`, owner, 13 Nov 2026) drives a real Chromium
through the athlete's main path against a production build of the app. The app talks to
`scripts/e2e/mock-supabase.mjs`, an in-memory stand-in for Supabase auth and PostgREST, so nothing
touches Staging or Production and no account or key is needed.

What it walks, in order:

1. `/training`: choose the goal "คุมบอลดีขึ้น"; one current goal row, `ball_control`.
2. Open the first unlocked programme, "เริ่มโปรแกรมนี้", set a schedule that includes today;
   one active enrollment.
3. Session: the pain question, tick every drill, "ซ้อมเสร็จ"; one check-in. The same session,
   opened in a second tab beforehand, is then finished there too: it reaches the unique key
   (23505), shows "done", and there is still one check-in.
4. Open the session again the same day: "วันนี้ซ้อมแล้ว".
5. `/progress` shows "1 ครั้ง" (not "11 ครั้ง") and the goal.
6. `/progress/tests`: juggling 12 (one row of 12), then corrected to 15 the same day (one row of 15).
7. The juggling history lists 15; delete it; the row is gone from the data and from the list.
8. `/profile`, no results: "ลองวัดพัฒนาการครั้งแรก", 3 tests (born 2012-03-04, so the 12+ long
   jump is open).
9. `/profile` with juggling 30 days old and the others 3 days old: "ถึงเวลาทดสอบแล้ว", 1 test.
10. Signed in as the child's accepted guardian, `/guardian/[athleteId]/progress` shows the child's
    name, "1 ครั้ง" and the goal, with no form, input or button (the language switch aside).
11. The same guardian on another child's id gets a not-found page that names no child.
12. No script error in any tab, and the app asked the mock for nothing it does not know.

Clicks wait until React has attached its handlers to the element, then click once; a click that
does nothing fails. On every page axe-core runs the WCAG 2.1 A/AA rules once animations that end
have ended (at most 2 seconds), and the run fails on any serious or critical finding. Moderate and
minor findings are printed, not failed. Text over a photo or a gradient cannot be measured by axe
("incomplete"); the run prints how many such elements it saw (60 on 13 Nov 2026), and those need a
person's eye.

## How faithful the mock is

- `set_my_training_goal`, `record_my_self_test` and `delete_my_self_test` check what sql/95 and
  sql/96 check (signed in, known goal or test, value range, athlete row, long jump from 12 by
  `athlete_profiles.birth_date`) and raise the same codes. Locks are not modelled.
- Unique keys as in sql/63 and sql/96, including the partial index of one *active* enrollment.
- No RLS: every row is visible to the caller named by the bearer token. Access rules are checked
  by `npm run security:rls` and `scripts/rls-browser-check.mjs`, not here.
- A table, function or filter operator it does not know is answered with 501 and fails the run.
  Tables the pages read that this flow has no rows for are listed in `EMPTY_BY_DESIGN`.
- `select` is ignored: whole rows come back, with the guardian link's embedded profile written in.

## Run it

Needs Playwright with Chromium, which is not a dependency of this repo (cloud sessions have it
installed). `axe-core` is a pinned dev dependency.

```bash
export NEXT_PUBLIC_SUPABASE_URL=http://localhost:54399 NEXT_PUBLIC_SUPABASE_ANON_KEY=e2e \
       NEXT_PUBLIC_SELF_TESTS=true NEXT_DIST_DIR=.next-e2e
npx next build && git checkout -- tsconfig.json   # the build adds the dist dir to tsconfig
npx next start -p 3100 &
PLAYWRIGHT_MODULE=/opt/node22/lib/node_modules/playwright/index.mjs npm run test:e2e
```

Screenshots of failed steps go to `.e2e-out/` (`E2E_OUT` to change). `E2E_BASE_URL` points it at
another host. The mock listens on port 54399.

## Limits

- Not in CI: CI only checks the two scripts' syntax. Running it needs a build plus a browser.
- Coach and organizer pages are not walked.

## Reading a failure

A failed step prints a screenshot path and every request during the step, in order, with its
time from the step's start: `mock` lines are reads and writes the app made, `browser` lines are
the page-data requests (`rsc`, `prefetch`) and what became of them (`headers`, `done`,
`aborted`).

## Findings (13 and 14 Nov 2026)

Fixed:

- Red text on the dark Matchday training pages (the drill timer, the source link) was 2.95:1. It
  now uses the Matchday text red `--ui-red-text` `#ff5a5a` (5.5:1 or more).

Open:

- **A tap before hydration does nothing.** Right after `/training` loads, a tap on a goal comes
  before React has attached its handlers and is lost, with no sign (seen in 1 of 5 runs before
  the test waited for hydration). It applies to every client button, and lasts longer on a slow
  phone. Ways to close it need the owner's choice (a form that works without JavaScript, or
  buttons shown as not ready until hydrated).
- **A page sometimes does not update after a write** (diagnosed 14 Nov 2026, partly fixed). The
  write always reaches the data; what fails is the page's fresh-data request (React Server
  Component request), which Next cancels (`net::ERR_ABORTED`), so the screen keeps the old data
  until the next reload. Evidence from the step traces (a failed step prints every request in
  order; see "Reading a failure" above):
  - **`router.replace()` then `router.refresh()` at once** (GoalPicker, ScheduleForm,
    DeleteTeamPanel, OnboardingFlow): both requests went out together and both were cancelled.
    Reproduced alone on the goal tap: 2 of 30 and 1 of 40. Fixed on 14 Nov: one call through
    `goFresh()` (`lib/fresh-navigation.ts`), and `tests/fresh-navigation.test.ts` fails if the
    pair comes back.
  - **`router.refresh()` alone** (self-test save and delete, history delete): cancelled once its
    headers arrive, seen in the full flow only. Fixed on 14 Nov by not depending on it: the
    self-test card shows what was just saved or deleted (`savedSelfTestSummary`,
    `removedSelfTestSummary`) until the page's own data arrives, and a history row hides itself
    once its delete succeeds.
  - **Still open: the goal step.** With one call, the navigation to `/training?band=…` is still
    cancelled, always together with a prefetch of a programme card that starts in the same
    instant. Not yet known why Next cancels it.
  - Rates in the full flow. Before the fix: 5 of 20 runs (13 Nov), 4 of 10 and 1 of 12 (14 Nov),
    across the goal, schedule, session, self-test and history steps. After the fix (20 runs, 14
    Nov): 14 passed every step; the other 6 failed only the goal step; schedule, session,
    self-test and history did not fail once.
- On the not-found check: `notFound()` under the root `loading.tsx` answers 200 with a noindex
  meta, not 404 (known, low priority).
