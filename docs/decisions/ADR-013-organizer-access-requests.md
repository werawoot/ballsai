# ADR-013 - Organizer Access: Request in the App, Draft First, Admin Approves

**Status:** Accepted (owner confirmed "ยืนยัน ADR-013", 20 Oct 2026). The owner agreed every
answer below in a design interview on 20 Oct 2026 (the `grilling` skill, 14 questions over
three rounds, each "ใช่ทั้งหมด ตามที่แนะนำ").
**Builds on:** ADR-012 (prerequisite 2: organizer access in the app before any payment),
`sql/77` (only an admin may change `profiles.role`), sql/86 and sql/88 (notifications).
**Task:** T53 in `docs/national-readiness.md`.

## Context

`profiles.role = 'organizer'` lets an account create tournaments, confirm payment slips and
record match results, and a result changes minors' Power Rating. Today an admin sets the role
by hand in the Supabase SQL Editor: a manual step that grows with every organizer
(nationwide question 4). An account without the role that opens `/dashboard` sees
`components/NotOrganizer.tsx`, which explains access is turned on by an admin and offers no way
to ask. Tournaments have two states, `open` and `closed`; `POST /api/tournaments` creates them
`open`.

## Decision

### The request (Q1, Q5, Q13)

- The applicant gives: organization or event name, type (school, association, club,
  independent organizer), province, a contact phone, and a short note on what they plan to run.
  No ID card or other document is collected.
- One pending request per account. After a decline, a new request is possible 7 days later.
- "ขอเป็นผู้จัด" appears on the NotOrganizer page and, in `/welcome`, choosing "organizer" leads
  straight to the request form.

### Draft first, so one person can start alone (Q2, Q6, Q7, Q12)

- A new tournament state, **draft**. An applicant may create up to **3 draft tournaments** while
  the request is pending; an approved organizer has no draft limit.
- A draft is visible only to its creator and admins. It is enforced in the database (RLS), and
  drafts never appear in public lists, search or the sitemap.
- Opening registration, confirming slips and recording results need the organizer role.
- After approval a draft stays a draft until the organizer presses "เปิดรับสมัคร".

### Deciding (Q3, Q8, Q11)

- Every admin is notified of a new request. The queue lives at `/admin/organizers`. The first
  decision closes the request for all admins (one decision per request, under a row lock).
- Approval sets `profiles.role = 'organizer'`. Declining needs a short reason. The applicant is
  notified either way, with the reason on a decline.
- The app can grant **organizer only**. The `admin` role stays a SQL Editor step.

### What others see (Q9)

- An open tournament shows "จัดโดย: <organization> (<province>)".
- The phone and the note are seen only by admins.

### Revoking (Q4, Q14)

- An admin may revoke organizer access with a reason. Its effects:
  - The organizer's open tournaments close to new registrations.
  - Registered teams and every recorded result stay; they are the children's data.
  - No new result can be recorded.
  - The team owners, their accepted members and those members' accepted guardians in the
    affected tournaments are told that registration has closed.

### Existing organizers (Q10)

Accounts that already have the role keep it without a request.

## Consequences

- No one opens the SQL Editor to make an organizer again; the remaining manual step is an
  admin's decision in the app.
- An organizer can start alone (drafts) as the product rule asks, while nothing reaches a
  child's Power Rating before a person has checked the organizer.
- New migration: request table, draft state with RLS, request/decide/revoke functions,
  notifications, and changes to tournament creation and the public tournament reads.
- Pending questions for later: verifying organizations with documents, if fraud appears;
  letting an approved organization add co-organizers.
