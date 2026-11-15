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
12. On a slow connection (page data held 4 s), changing the goal waits for the page with no
    full load before the 6 s ceiling.
13. No script error in any tab, and the app asked the mock for nothing it does not know.

Clicks wait until React has attached its handlers to the element, then click once; a click that
does nothing fails. On every page axe-core runs the WCAG 2.1 A/AA rules once animations that end
have ended (at most 2 seconds), and the run fails on any serious or critical finding. Moderate and
minor findings are printed, not failed. Text over a photo or a gradient cannot be measured by axe
("incomplete"); the run prints how many such elements it saw (60 on 13 Nov 2026), and those need a
person's eye.

## The coach flow

`scripts/e2e/coach-flow.mjs` (owner, 15 Nov 2026) walks a coach's own team, on the same harness
(`scripts/e2e/harness.mjs`) and mock:

1. A coach makes a team with no tournament (`create_my_team`); one club team row, and the page
   moves to it.
2. The team page shows the team, "no requests yet" and a join link (`my_team_join_link`).
3. Signed in as the athlete, the link's page shows the team; "ขอเข้าทีม" writes one pending
   request. Asking again writes nothing.
4. The coach sees the request and accepts it; the athlete is an accepted member and the request
   is closed.
5. The coach deletes the team: the confirm button stays off until the team's name is typed,
   then the team and its members, link and requests are gone and the page moves to
   `/team-members`.

The mock's team functions check what sql/78, sql/79 and sql/83 check (owner, persona, name
length, draft roster, the typed name, one pending request per athlete) and raise the same codes;
notifications are not modelled. The team pages' lists that are empty in this flow (events, news,
plans, notes, minutes, staff, entries) answer an empty list.

Each run uses its own made-up client address (`x-real-ip`), because the app's rate limit counts
per address: ten runs back to back from one address tripped the join limit on the tenth ("ทำรายการ
บ่อยเกินไป"), which is the limit working. It also showed that every API limit is per IP only, so
people sharing one address (a venue's Wi-Fi, carrier NAT) share one allowance: task T65 in
docs/national-readiness.md.

First runs (15 Nov 2026) found and fixed two accessibility errors on the team page:
- The LINE share button had white text on LINE green at 2.26:1. It now has navy text on the
  same green, at 8.3:1.
- The roster table scrolls sideways and could not be reached by keyboard. It is now a focusable,
  named region.

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
- Organizer and admin pages are not walked.

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
- **A page sometimes did not update after a write** (diagnosed 14 Nov 2026; fixed on every
  step, with a fallback on the four navigations after a write, whose cause is still unknown). The write always reaches the data; what fails is the page's fresh-data request (React Server
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
    `removedSelfTestSummary`) until the page's own data arrives, and the history list drops a row
    once its delete succeeds (with the empty message when none is left).
  - **A navigation after a write can still stick: covered by a fallback, cause not known.** With
    one call, Next still cancels the navigation now and then, or leaves it pending after its data
    has arrived: seen on the goal step (always beside a programme-card prefetch) and on the
    schedule step (3 of 20 runs on 15 Nov, the session page's data in, no move). Every
    navigate-after-write now has a fallback (owner, 14 and 15 Nov 2026): it runs in a React
    transition, and if the browser is still on the page it left 1.5 s after the navigation ended,
    or 6 s after it started, the destination is loaded in full, once
    (`lib/use-fresh-navigation.ts` for the schedule, team delete and onboarding; GoalPicker checks
    the goal on screen with the same timings). "Left the page" rather than "reached the
    destination", so a server redirect elsewhere (an organizer sent on from `/organizer-request`
    to `/dashboard`) is not reloaded. A navigation still on its way under 6 s never reloads: the
    run's slow-connection step holds `/training` data for 4 s and fails on a full load before the
    ceiling. The run prints a `NOTE <step>:` line each time a fallback fires (a full load the test
    did not ask for; a server redirect's hops are not counted).
  - **What the slow step's ceiling loads are.** When the fallback fires on the slow step, the
    page's data had arrived at 4 s and Next had still not moved by 6 s: a stuck navigation, the
    same as on the other steps, not a slow one cut short. With a 12 s ceiling (data at 5 s) the
    same step was still stuck at 12 s in 8 of 20 runs.
  - **Not walked by the e2e run:** the team delete (coach pages) and onboarding fallbacks; they
    share the hook the schedule step proves.
  - Rates in the full flow (20 runs each unless said):
    - Before any fix: 5 of 20 runs (13 Nov), 4 of 10 and 1 of 12 (14 Nov) failed a step (goal,
      schedule, session, self-test or history).
    - One router call and local display (14 Nov): 14 of 20 passed every step; the other 6 failed
      only the goal step.
    - Goal fallback on a 3 s timer (14 Nov): 20 of 20; reload in 4.
    - Goal fallback with a 12 s ceiling (14 Nov): 11 of 20; the stuck navigation outlasted the
      test's 10 s wait. Dropped.
    - Goal fallback with a 6 s ceiling (15 Nov): 17 of 20; the 3 failures were the schedule step.
    - Fallback on every navigate-after-write, 6 s ceiling (15 Nov): **20 of 20 passed every
      step**. The fallback fired on the goal step in 6 runs, the schedule step in 5, and at the
      ceiling of the slow-connection step in 9 (never before it).
    - The same after the review fixes (arrival on leaving the page, once-only load, redirect
      hops not counted; 15 Nov): **20 of 20 passed every step**. The fallback fired on the goal
      step in 7 runs, the schedule step in none, and at the slow step's ceiling in 5.
- **A form sent before hydration put its fields in the URL** (found and fixed 15 Nov 2026). A
  form handled by `onSubmit` with no method is sent by the browser as a GET to the same page when tapped before React has hydrated, so every named field lands in the
  URL (history, server logs, Referer): an organization invite's email, a venue's phone number
  and address, a coach's note and reason about an athlete, booking messages. All 20 such forms
  now say `method="post"`; their handlers already call `preventDefault()` first, so nothing
  changes once hydrated. Checked on the e2e build: a form POST to a page (`/progress/tests`,
  `/organizer-request`, `/training`) answers 200 with the page itself, so an early tap reloads the
  page with nothing in the URL (the typed values are lost, as with a reload).
  `tests/form-submit-before-hydration.test.ts` fails on a new form without it.
- **Root cause found: the root route skeleton** (15 Nov 2026). With `app/loading.tsx` around every
  route, a navigation after a write stuck now and then: its data arrived and React never
  committed. Ruled out first: no stylesheet, script or font left loading; no
  `AbortController.abort()` from the page (the `aborted` the trace shows is Playwright's word for
  a stream the page stopped reading, and successful navigations show it too); no router call
  outside a user action. A/B on the same build: with the skeleton, the fallback reloaded on the
  goal step 7 times and at the slow step's ceiling 5 times in 20 runs; without it, 0 in 40 runs
  (20 probe runs, then 20 runs of this script). The skeleton is removed (owner, 15 Nov 2026);
  `glass.css` moved to `app/layout.tsx`; 13 pages screenshot before and after differ in 0.00% of
  pixels (screenshots in the session, not in the repo). The fallbacks stay as a guard, and a
  navigation started by code now shows the bar's progress line (`announceNavigation`). Final
  20 full runs on the reviewed code (15 Nov 2026): 20 of 20 passed every step, no fallback fired,
  no browser error.
  **Open:** in the 40 runs one React hydration error (#418) showed once, in a probe run that did
  not record the page; the script now records it, and it has not shown again. Cause unknown.
  **Not measured:** without the skeleton a server page sends nothing until its data is ready, so
  a URL typed on a slow page shows a blank wait instead of the skeleton; the mock answers at
  once, so the e2e run cannot measure it.
- **Not-found pages are real 404s now.** Under the root skeleton `notFound()` streamed a 200 with
  a noindex meta; without it, a guardian on another child's id and an unknown self-test get 404.
  The e2e check now requires 404.
