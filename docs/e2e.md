# Browser end-to-end check (athlete flow)

`npm run test:e2e` (`scripts/e2e/athlete-flow.mjs`, owner, 13 Nov 2026) drives a real Chromium
through the athlete's main path against a production build of the app. The app talks to
`scripts/e2e/mock-supabase.mjs`, an in-memory stand-in for Supabase auth and PostgREST, so nothing
touches Staging or Production and no account or key is needed.

What it walks, in order, checking the in-memory rows after each write:

1. `/training`: choose the goal "คุมบอลดีขึ้น"; the goal chip shows and one goal row exists.
2. Open the first unlocked programme, "เริ่มโปรแกรมนี้", and set a schedule that includes today.
3. Session: the pain question, tick every drill, "ซ้อมเสร็จ"; exactly one check-in row.
4. Open the session again the same day: "วันนี้ซ้อมแล้ว", still one check-in.
5. `/progress` shows "1 ครั้ง" and the goal.
6. `/progress/tests`: juggling 12, then corrected to 15 the same day; one row of 15.
7. The juggling history lists 15; delete it; no row left.
8. `/profile`: the reminder card says three tests are due.
9. No script error in the browser.

On every page it also runs axe-core with the WCAG 2.1 A/AA rules, after page animations finish,
and fails on any serious or critical finding.

## Run it

```bash
export NEXT_PUBLIC_SUPABASE_URL=http://localhost:54399 NEXT_PUBLIC_SUPABASE_ANON_KEY=e2e \
       NEXT_PUBLIC_SELF_TESTS=true NEXT_DIST_DIR=.next-e2e
npx next build && git checkout -- tsconfig.json   # the build adds the dist dir to tsconfig
npx next start -p 3100 &
npm run test:e2e                                  # PLAYWRIGHT_MODULE=<path> if playwright is global
```

Screenshots of failed steps go to `.e2e-out/` (`E2E_OUT` to change). `E2E_BASE_URL` points it at
another host. The mock listens on port 54399.

## Limits

- Not in CI yet: CI only checks the two scripts' syntax. Running it needs a build plus a browser.
- The mock has no RLS and one signed-in user. Access rules are checked by
  `npm run security:rls` and `scripts/rls-browser-check.mjs`, not here.
- The guardian, coach and organizer pages are not walked yet.

## Found on its first runs (13 Nov 2026)

- Red text on the dark Matchday training pages (the drill timer, the source link) was 2.95:1;
  it now uses the Matchday text red `#ff5a5a` (5.5:1 or more).
- A tap in the first moment after `/training` loads, before React has attached its handlers,
  does nothing (1 run in 5). The test clicks again; the page itself is unchanged.
