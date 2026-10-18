# ADR-011 - Team Roster, Phase 1: Join Links, Leaving and Removal

**Status:** Accepted (owner confirmed "ยืนยัน ADR-011", 18 Oct 2026). The owner agreed every answer below in a design
interview on 18 Oct 2026 (the `grilling` skill, 17 questions over three rounds).
**Builds on:** ADR-010 (roster locks on submission, one team per athlete per tournament),
`sql/18` (team_members), `sql/78` (own teams), `sql/82` (my_team_memberships).

## Context

`AGENTS.md` lists "a real team roster linking members to accounts" as the task before W1
grows past 5 testers. Most of it already exists: a coach invites by email, the athlete accepts,
and match results only accept members who accepted (in the page and again on the server).
What was still missing:

- An athlete cannot ask to join a team; they wait for an email invitation (breaks the
  product rule that each role can act alone first).
- An athlete cannot leave a team. A coach can remove one, with no reason recorded.
- `teams.members`, the old free-text roster, is no longer used by the app but still holds
  text that may name other children.
- Young children often have no email of their own, so a coach cannot invite them.

## Decision

### Scope and phases (Q1, Q6)

- **Phase 1** (this ADR, before W1 grows past 5 testers): join links and requests, leaving,
  removal with a reason, several teams at once, clearing `teams.members`.
- **Phase 2** (its own design interview later): a guardian creates and manages a child's
  athlete profile when the child has no account. It changes how every table ties an athlete
  to a login, and the app holds no service role key, so it is designed separately. Until
  then a young child signs up as an athlete with a guardian's email.
- **Changes after a team is submitted** (ADR-010 rule 1C, organizer approval) stay planned
  for before the provincial pilot (T42).

### Join link (Q2, Q7, Q12, Q13)

- Each team has one join link. It does not expire.
- The coach can make a new link at any time, and the old one stops working at once. The
  coach can also stop taking requests.
- No public team search: a team is found only through its link. This keeps lists of
  children's teams away from strangers.
- The coach's team page has a card "ชวนนักกีฬาเข้าทีม" with copy link, share to LINE and a
  QR code to scan at the field.
- Opening the link shows only the team name, the coach's display name and the province,
  never the roster. "ขอเข้าทีม" asks for sign-in. An account without an athlete profile goes
  through the profile step and then returns to send the request by itself.
- Email invitations stay alongside the link (Q17).

### Requests (Q8, Q9, Q10, Q14)

- A request no one answers expires after 30 days.
- A team holds at most 50 open requests at once. A repeated request from the same athlete
  to the same team is the same request.
- An athlete under 18 may request without a guardian's approval. An accepted guardian is
  notified, and may leave the team on the child's behalf. Making a profile public still
  needs guardian consent, unchanged.
- Before deciding, the coach sees only display name, position and birth year. No email,
  phone or full birth date.
- The team page lists "คำขอเข้าทีม (n)" with "รับเข้าทีม" and "ไม่รับ". The coach is
  notified of each new request. Accepting makes the athlete an accepted member at once,
  because the athlete asked. The athlete and accepted guardians are notified either way.

### Several teams (Q4)

An athlete may belong to any number of own (club) teams at once. ADR-010 rule 2A still
holds: one team per athlete per tournament.

### Leaving and removal (Q5, Q15, Q16)

- The athlete, or an accepted guardian, can leave a team at any time while it is not
  submitted to a tournament.
- The coach can remove an athlete with a reason chosen from a list: moved team, asked to
  leave, not at training for a long time, other. "Other" needs a short note of at most 200
  characters. The athlete and accepted guardians see the reason in the notification.
- Membership history is kept: a left or removed row stays, and the athlete may rejoin later.
- After a team is submitted, neither side can change it. The page says "ทีมส่งสมัครแล้ว
  ติดต่อโค้ชหรือผู้จัด" (ADR-010 rule 1A).

### Free-text roster (Q1 ง, Q11)

Clear `teams.members` and stop anyone reading it. Only test data exists today.

## Consequences

- One new migration (number taken at the time of writing, after 82). All writes go through
  RPCs; no browser writes to `team_members` or the request table directly.
- Every request, approval, leave and removal runs inside the database with a row lock, so a
  double tap or a retried request has the effect of one.
- Indexes for the new reads: open requests per team, and a team by its link token.
- No manual step per athlete or team: links, expiry and limits run by themselves.
- The `/dashboard/results` note in `AGENTS.md` ("rosters are free text") is out of date and
  is corrected in the same change.

## Implementation notes (sql/83, code review 18 Oct 2026)

Added while building, each in service of a decision above; none changes one:

- An athlete may hold at most 20 open requests across teams, so one account cannot spam
  coaches nationwide (the 50 per team cap protects a team, not the coaches).
- A request needs a display name: the coach decides by name (Q10). The join page asks for
  one when the profile has none.
- Opening the link with a pending email invitation accepts that invitation (Q17), and the
  coach is told. Leaving an invitation never accepted records it as declined.
- The coach is told when an athlete leaves, so the roster never changes silently.
- Leaves and removals are also written to `team_member_history`, so a rejoin keeps why
  someone left before ("membership history is kept").
- Until sql/83 is applied, a removal goes through sql/47 without a reason and the page says
  the reason was not sent.

Known limits, left for later: a guardian's child list shows up to 100 teams; after a
declined request the athlete may ask again at once (the coach can stop the link); the
coach's name in the preview is `profiles.full_name`, the name families see (sql/76).
