# ADR-009 - Thai and English Interface

**Status:** Proposed
**Date:** 2026-09-27

## Context

The owner wants people who do not read Thai to be able to use BallDoenSai.com, with a
Thai / English choice on the page. Before this decision every string was written in Thai
directly into the code: about 1,350 lines across 166 of the 200 files under `app/`,
`components/` and `lib/`, plus 45 API route handlers, 22 `lib/` modules (including
email) and 16 SQL files whose triggers write Thai sentences into `notifications`.
Nothing read a language preference; `<html lang="th">` was hard-coded.

Every new page adds to that count, so the cost of retrofitting grows with time. The
translation itself can be gradual; the mechanism cannot.

## Decision

Use `next-intl` (v4, App Router, no locale routing).

- **Languages:** `th` (default) and `en`, in `i18n/config.ts`.
- **Choice:** stored in the `NEXT_LOCALE` cookie for a year. The URL does not change, so
  links already shared (player profiles, tournaments) keep working, and athlete pages,
  which belong to minors, gain no second indexable copy.
- **Messages:** `messages/th.json` and `messages/en.json`. Thai is the source of keys:
  `i18n/next-intl.d.ts` types every `t('key')` against `th.json`, so a missing key fails
  `next build`.
- **Fallback:** English is laid over Thai (`withFallback`), so an untranslated string
  shows in Thai, never as a raw key or a blank.
- **Switch:** `components/LanguageSwitch.tsx`, rendered by `PageHeader`: one 44px button
  naming the other language ("EN" / "ไทย"), labelled in that language.
- **User content is never translated:** names, team names, venues and tournament text
  show as entered.
- **Pure modules return keys, components word them.** For example `lib/tournament-cover.ts`
  returns `'open' | 'closed'` and `TournamentCover` renders `t('status.open')`.

### Guard against new hard-coded Thai

`tests/i18n-thai-baseline.json` lists every file under `app/`, `components/` and `lib/`
that still writes Thai text in a string, template or JSX text literal. Files are parsed with
the TypeScript compiler, so comments never count and a comment cannot hide code; the baht
sign is excluded. `tests/i18n.test.ts`
fails when a file not on the list contains Thai, and when a listed file no longer does.
The list may only shrink. New code puts every user-facing string in `messages/*.json`.

`tests/i18n.test.ts` also holds the two message files to the same keys, the same
placeholders, no empty strings, and formats every message with next-intl's own runtime.

## Considered Options

1. **Locale in the URL (`/en/...`)** - searchable per language and shareable in a
   language, but every page moves under `app/[locale]/`, every link changes, and shared
   links to minors' profiles would gain an indexable English copy. Rejected for now; it
   can be added later for chosen public pages without changing the message files.
2. **Browser `Accept-Language` detection on first visit** - rejected: a Thai family on
   an English-language phone would land in English. Thai stays the default; the person
   chooses.
3. **Hand-written dictionary without a library** - rejected: plurals, ICU placeholders,
   dates and numbers per locale, and type-checked keys would all have to be rebuilt.

## Consequences

- Reading the cookie in the root layout makes every route render per request. Before
  this, a few pages (`/tournaments`, `/privacy`, `/terms`) were prerendered; their data
  reads are already cached (`unstable_cache`), so the cost is the render only. If that
  ever matters, next-intl's `localePrefix: 'never'` routing restores static rendering per
  locale while keeping URLs unchanged, at the price of moving pages under `app/[locale]/`.
- A page not yet translated shows Thai content under an English menu and header. That
  is expected during the rollout.

## Rollout

| Phase | Scope | Status |
| --- | --- | --- |
| 1 | Mechanism, switch, bottom nav, `PageHeader`, route skeleton, `/tournaments` and its card cover, metadata | Done (this ADR) |
| 2a | `/welcome` (with the switch in its header), `/card` builder, profile share panel | Done |
| 2b | `/login`, `/profile` page and form, `/career`, tournament detail and team registration | Waiting: these files differ on `codex/player-card-beta` or are being edited by another agent, so translating them here would conflict. Do after the branches meet. |
| 3a | 404 and error pages, notifications (list, page, bell; `unreadBadge` now returns a count, not Thai words), the `/ranking` and `/athletes` filters, `LoadingModal` | Done |
| 3 | API errors as codes worded by the UI; venues (their labels come from `lib/venue-card-stats.ts`); remaining pages; `DiscoverTabs`, profile menu; Thai province names shown to English readers (a fixed list of 77 with official English names) | Planned |
| 4 | Notifications: triggers write Thai sentences into `notifications`, which cannot be translated after the fact. Needs a new migration (type + parameters, worded at render) and a stored language on `profiles` for email. Touches the verified-result chain, so the design is agreed first. | Planned, needs agreement |
| - | `/privacy`, `/terms`, guardian consent wording: professional, legally reviewed translation only; Thai remains the governing text | Waiting on owner |
| - | Supabase Auth email OTP template in English (dashboard setting, not code) | Waiting on owner |

The switch is not yet on pages with their own header: the home page (protected by
AGENTS.md rule 7; needs owner approval), the four identity pages (impact, career, card,
hall-of-fame), and `/login`. `/welcome` has it; on phones its header now takes two rows
(brand, then switch and skip) in both languages.

## Terms for the owner to confirm

| Thai | English used | Note |
| --- | --- | --- |
| บอลเดินสาย | circuit tournament | No established English term |
| รายการแข่ง (bottom nav) | Events | "Tournaments" does not fit a 320px tab |
| แจ้งเตือน (bottom nav, venue bell) | Alerts | "Notifications" does not fit a 320px tab; the page title is "Notifications" |
| ค้นหา (bottom nav) | Discover | The tab holds athletes, ranking and Hall of Fame |
| ข้ามไปดูก่อน (/welcome) | Skip for now | Shorter than a literal "look around first" |
| ผู้ปกครอง (/welcome) | Parent / Guardian | |
| ไม่พบสนามที่กำลังหา (404) | Can't find that pitch | Keeps the football wording of the Thai |
| เกมนี้สะดุด แต่เรายังไปต่อได้ (error) | Play stopped, but we can carry on | |
