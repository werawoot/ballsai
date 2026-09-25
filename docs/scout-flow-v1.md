# Scout Flow — v1

`/scout` shows only athletes with `athlete_profiles.is_public = true`, with filters for name, province, position and Power Rating. A signed-in scout can save a private note and shortlist entry; neither the athlete nor another scout can read it. Apply `sql/25-scout-shortlists-v1.sql` before deploying this flow.

## `/api/scout-shortlist`

| Method | Purpose | Backing call |
| --- | --- | --- |
| `GET ?athleteId=<uuid>` | Read back one shortlist row for the signed-in scout. Answers `{ athleteId, saved, note }`. | `select` on `scout_shortlists`, filtered by `scout_id = auth.uid()` **and** `athlete_id` |
| `POST` | Save or update the scout's note for an athlete. | `add_scout_shortlist_safely` (upsert on the unique `(scout_id, athlete_id)`) |
| `DELETE` | Remove the athlete from the scout's shortlist. | `remove_scout_shortlist_safely` (plain delete) |

All three require a signed-in user and answer `401` otherwise. `GET` is read-only and calls
no RPC: it exists so a write whose response was lost can be resolved by asking the server
what the row actually says, rather than by repeating the write. `saved: false` is a real
answer; a database failure answers `400`, never a guess.

Because `scout_shortlists` is private to its scout by RLS **and** the `GET` query is scoped
to the caller's own id, this route cannot be used to discover whether another scout has
shortlisted an athlete.

### Recovery behaviour in the UI

When a `POST` or `DELETE` never produces a response, `app/scout/ScoutClient.tsx` marks that
one athlete's row as unresolved: the row refuses further writes and offers "โหลดสถานะใหม่",
while every other row on the board stays usable. The button issues the `GET` above and the
row is released **only** when that read succeeds; a failed read leaves the row locked and
the button pressable again. Replies are matched against a per-athlete attempt number, so an
older answer arriving after a newer press is discarded. The rules live in
`lib/scout-shortlist-recovery.ts` and are covered by `tests/scout-shortlist-recovery.test.ts`
and `tests/scout-shortlist-readback-api.test.ts`.
