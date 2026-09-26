# Navigation — v1

One bottom navigation bar for the whole app. Status: **EXISTING** (this branch).

## Where it lives

| Piece | File | Notes |
| --- | --- | --- |
| Rules (tabs, ownership, visibility, loading phase) | `lib/site-nav.ts` | Pure functions, no React. Covered by `tests/site-nav.test.ts`. |
| Bar | `components/SiteNav.tsx` | Client component, mounted **once** in `app/layout.tsx`. Pages must not render their own bottom bar; a test sweeps `app/` for it. |
| Discover switch | `components/DiscoverTabs.tsx` | Server component on `/athletes`, `/ranking`, `/hall-of-fame`. |
| Route skeleton | `app/loading.tsx` | Suspense fallback for server-rendered routes; the bar stays on screen. |
| Styles | `app/globals.css` (`.bds-nav*`, `.bds-route-*`, `.bds-discover-*`, `.bds-skel-*`) | `--nav-height` is shared by the bar and its spacer. |

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
3. `app/loading.tsx` shows a skeleton for server-rendered routes.

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
