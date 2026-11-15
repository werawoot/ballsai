# Navigation — v1

One bottom navigation bar for the whole app. Status: **EXISTING** (this branch).

## Where it lives

| Piece | File | Notes |
| --- | --- | --- |
| Rules (tabs, ownership, visibility, loading phase) | `lib/site-nav.ts` | Pure functions, no React. Covered by `tests/site-nav.test.ts`. |
| Bar | `components/SiteNav.tsx` | Client component, mounted **once** in `app/layout.tsx`. Pages must not render their own bottom bar; a test sweeps `app/` for it. |
| Discover switch | `components/DiscoverTabs.tsx` | Server component on `/athletes`, `/ranking`, `/hall-of-fame`. |
| Styles | `app/globals.css` (`.bds-nav*`, `.bds-route-*`, `.bds-discover-*`) | `--nav-height` is shared by the bar and its spacer. |

## Tabs

Five destinations, the ceiling in both Apple HIG and Material 3:
หน้าแรก · ค้นหา · รายการแข่ง · แจ้งเตือน · โปรไฟล์.

A page reached from inside a tab keeps that tab lit (`NAV_ITEMS[].owns`, segment-aware):
`/players/*`, `/ranking`, `/hall-of-fame`, `/scout` → ค้นหา; `/venues*`, `/sponsorships`,
`/team-members`, `/career`, `/dashboard*` and similar → โปรไฟล์. `/terms`, `/privacy` and
`/impact` light nothing.

Destinations that left the bar are one tap away: นักกีฬา / Ranking / Hall of Fame through
the Discover switch; สนาม / โอกาส / สมาชิกทีม / Career through "เมนูของฉัน" on `/profile`
(`PROFILE_MENU`).

Hidden on `/login`, `/welcome` and `/admin/*` (task flows and a separate workspace).

## Data

The unread badge is read in the browser with the existing
`fetchUnreadNotificationCount` against the user's own session; RLS on `notifications` is
the guard. It is not fetched in the root layout, so statically rendered pages stay static.
No new table, column, RPC or API route.

## Loading feedback

1. The tapped tab shows a pending ring in the first frame.
2. A top progress bar runs while the route has not changed (`navigationPhase`), finishes
   when it does, and is abandoned by a 12s watchdog so it can never hang.
3. No route skeleton (owner, 15 Nov 2026). The root `app/loading.tsx` made a navigation after
   a write stick now and then: in 20 full e2e runs the fallback reloaded 12 times (7 on the goal
   step, 5 at the slow step's ceiling); with it removed, 0 in 40 runs (docs/e2e.md). The old page
   stays on screen, with the progress line, until the new one is ready. `glass.css` is imported
   by `app/layout.tsx`, as the skeleton did.
4. A navigation started by code after a write (`goFresh` in `lib/fresh-navigation.ts`) calls
   `announceNavigation()`, which starts the same progress line and live region as a tapped
   link. A change of query on the same page (filters) shows no line, as for links.
5. `/admin` keeps its own `app/admin/loading.tsx` (the bar is hidden there); `/login` and
   `/welcome` have no bar.

`prefers-reduced-motion` turns the animations off; a polite live region announces
"กำลังโหลดหน้า…".

## Sizing

Grid of five equal columns, so nothing can overflow. Items are at least 52px tall; labels
are 12px, stepping down to 11px below 360px wide (at 320px, "รายการแข่ง" needed 58.3px of
the 57.6px available at 12px). `viewport-fit=cover` plus `env(safe-area-inset-bottom)`
keeps the bar above the iPhone home indicator.

## Pending documentation

`docs/architecture/system-architecture.md` does not exist on `main` yet; it arrives with
`codex/player-card-beta`. When both are on the same branch, add a short "Navigation"
entry there pointing to this file rather than duplicating it.
