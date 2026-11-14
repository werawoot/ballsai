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

## Findings (13 Nov 2026)

Fixed:

- Red text on the dark Matchday training pages (the drill timer, the source link) was 2.95:1. It
  now uses the Matchday text red `--ui-red-text` `#ff5a5a` (5.5:1 or more).

Open, not fixed:

- **A tap before hydration does nothing.** Right after `/training` loads, a tap on a goal comes
  before React has attached its handlers and is lost, with no sign (seen in 1 of 5 runs before
  the test waited for hydration). It applies to every client button, and lasts longer on a slow
  phone. Ways to close it need the owner's choice (a form that works without JavaScript, or
  buttons shown as not ready until hydrated).
- **A page sometimes does not update after a write.** In 5 of 20 full runs one step failed the
  same way: the write reached the data, but the page did not show it (the self-test card still
  "ยังไม่เคยทดสอบ" after "บันทึกแล้ว"; the history row still listed after its delete; the
  schedule not moving on to the session). Each write is followed by `router.refresh()`
  (and `router.replace()` for the schedule). Run alone, the self-test save did it 0 times in 15.
  Not yet known whether it is the app or the load of this test container; to be diagnosed before
  the test can gate CI.
- On the not-found check: `notFound()` under the root `loading.tsx` answers 200 with a noindex
  meta, not 404 (known, low priority).
