# ADR-014 - Light Glass Design, Real Photos Only, and the DOENSAI.com Brand

**Status:** Accepted for the design (owner, 21 Oct 2026: "ก2 ข2", "ลองหน้านี้ก่อนเลย").
The brand rename is decided but **not started**; it needs its own plan (below).
**Replaces:** AGENTS.md hard rule 7 (dark sport editorial, red `#CC0001`) and the Stadium /
Paper surfaces of `docs/design-system.md`, page by page as each page is moved.

## Context

The owner bought `doensai.com` and chose, in two answers:

- **ก2:** rename the product from BallDoenSai.com to **DOENSAI.com** everywhere (logo, email,
  documents), so the platform can grow beyond football. A person should be able to follow
  more than one sport.
- **ข2:** replace the dark, red home-page language with a **light glassmorphism** look over
  real football photography: white and pale-green frosted panels, electric green `#16E06E`
  for primary actions, navy `#0B1220` text, IBM Plex Sans Thai. The owner supplied a brief
  and a reference mock (a stadium at dusk, glass cards, green buttons).

The owner also ruled: **real photos only, no drawn or cartoon images, and nothing under
copyright we may not use.**

## Decision

### Design

- Tokens and shared pieces live in `app/glass.css`. A page opts in with the `gl` class on
  its root; nothing applies to a page without it, so the rest of the site is unchanged until
  it is moved.
- Glass is used where it helps (page heads over a photo, the lead card, tabs). Lists, tables
  and forms sit on solid white for reading at the pitch. Every glass panel has a solid
  fallback where `backdrop-filter` is missing.
- Status is a word and a colour, never colour alone. Text meets 4.5:1 (values measured in
  `app/glass.css`).
- Rollout order: `/tournaments` (first, this change), the home page once real photos are in,
  `/players/[id]` and `/ranking`, then the organizer dashboard (light, little glass).

### Photos

- Only real photographs, under a licence that allows commercial use without payment
  (Unsplash Licence, Pexels Licence) or taken by the owner. Each one is recorded in
  `docs/photo-credits.md` (source page, photographer, licence, date) when it is added.
- A stock photo of a **place** (a stadium or pitch) is atmosphere only, behind a page head.
  It is never a tournament or venue cover, because it would pass itself off as the real
  venue (`lib/tournament-cover.ts`).
- A tournament card with no photo of its own may show a stock **close-up**: a ball on
  grass, a trophy, or a close crop of grass and pitch markings that shows no goal, stand or
  sign (owner, 21 Oct 2026, "ครับเอาเลย"). It names no place, so it cannot be mistaken for
  the venue. The organizer's own photo replaces it once T57
  lets organizers upload one. `lib/stock-photos.ts` keeps the two kinds apart, and
  `tests/stock-photos.test.ts` fails a photo without a file or a credits row.
- A training programme card on `/training` may show an **adult player whose face is not shown**
  (from behind, head down, or a silhouette), with no readable brand (boot stripes retouched out
  where they show); where no such photo fits, a pitch photo (owner, 24 Oct 2026). The drills keep
  their own 3D pictures, which show each movement exactly. `PROGRAM_PHOTOS` in
  `lib/stock-photos.ts`.
- No stock photo shows an identifiable child, and no photo shows a club crest or brand logo.
  Athlete photos come only from the athlete's own upload under the consent rules (rule 6, 9).
- Until a photo is added, a head is a plain pitch green (`--gl-stadium-photo: none`). No
  drawn stadium ships in the app.

### Honest data (unchanged rules, restated for this design)

The reference mock shows live scores, minute-by-minute goals, top scorers, group tables and
growth percentages. None of these exist in the system. They are built only when the data
exists; until then a section is left out, never filled with invented numbers (rule 8,
nationwide rule 5).

### The DOENSAI.com rename: decided, not started

The rename touches the Google OAuth consent screen, the Supabase SMTP sender, the auth
redirect URLs, the privacy and terms text under legal review (T25), the W1 invite documents
and every logo. Multi-sport touches `lib/season.ts` (one active sport today), `player_ranks`
and the onboarding sport picker. Both need a design interview and their own ADR before code.
Until then the product name in the app stays BallDoenSai.com.

**Update, 24 Oct 2026 (owner: "มันชื่อ doensai.com", then "ชื่อ/โลโก้ที่เห็นในแอปทั้งหมด"):**
every name the app shows now reads DOENSAI.com or DOENSAI: page titles, headers, the
loading screen, error pages, cards, share text, admin pages and training programme names.
`tests/brand-name.test.ts` keeps it that way. The brand mark is the owner's own logo file
(a green and white "D" on a dark rounded square, sent 24 Oct 2026): `public/brand/doensai-mark.webp`
through `components/BrandMark.tsx`, and `app/icon.png` / `app/apple-icon.png` for the browser tab and
phone home screen. The mark is shared, so pages still on the old dark look (career, hall of
fame, admin) show the new logo too; that is deliberate (owner: every logo in the app).
Not moved yet, on purpose, each needing the owner:

- the terms and privacy pages (`app/terms`, `app/privacy`), under legal review (T25);
- guardian consent and privacy wording that names the site (`app/guardian/GuardianLinksClient.tsx`,
  `app/sponsorships/SponsorshipsClient.tsx`, `profileHome.guardianInvite.text`), which is
  never edited on the owner's behalf;
- the e-mail sender name (`RESEND_FROM_EMAIL`, Supabase SMTP), the Google OAuth consent
  screen and the domain itself (host names in `scripts/`), all set outside the repo;
- internal keys (`lib/rate-limit.ts`) and demo data.

Multi-sport (`lib/season.ts`, `player_ranks`) is still not started.

## Consequences

- Hard rule 7 now reads: the light glass design of this ADR, page by page.
- `/tournaments` is the first page on it. Its header bar and bottom bar first stayed the old
  shared components; since commit e9238d8 (21 Oct 2026) both turn to glass on any page
  that opts in (`app/glass.css`), and stay dark on pages not yet moved.
- Real photos need the cloud environment to allow `images.unsplash.com` and
  `images.pexels.com`, or the owner to send the files.
