# Coach and venue beta: database safety research

Date: 17 September 2026. Scope: source review and official documentation only; no production connection, SQL application, or environment-file access. Repository target is Supabase `hivedzrwrrcnjrlirhtv`, confirmed from README and runbook, not from a live connection. Recommendations below require a new migration; applied SQL20/31/40/41 must not be edited.

## Nonoverlapping court availability

PostgreSQL supports exclusion constraints combining resource equality and range overlap. A half-open `tstzrange(starts_at, ends_at, '[)')` permits adjacent bookings while rejecting overlapping intervals for the same court. A scalar equality operator class from `btree_gist` can be combined with range overlap in GiST; UUID is supported. This is stronger than an exact tuple uniqueness check. Sources: [PostgreSQL range constraints](https://www.postgresql.org/docs/current/rangetypes.html#RANGETYPES-CONSTRAINT), [btree_gist](https://www.postgresql.org/docs/current/btree-gist.html).

Design inference: use a court-row lock before checking or creating availability, then recheck overlaps in a subsequent statement. Locking only matching slot rows cannot serialize two inserts when neither matching slot exists. All slot create/edit/reopen paths must use the same court lock; a database exclusion constraint is the backstop against alternate write paths. Keep a consistent court → slots (ordered by ID) → bookings order when introducing multi-slot operations, and avoid mixing it with an inverse order. PostgreSQL holds row locks to transaction end and warns that inconsistent acquisition order causes deadlocks. Sources: [row locks and deadlocks](https://www.postgresql.org/docs/current/explicit-locking.html#LOCKING-ROWS), [Read Committed snapshots](https://www.postgresql.org/docs/current/transaction-iso.html#XACT-READ-COMMITTED).

Decide explicitly whether blocked historical slots occupy the interval. For the current lifecycle, excluding overlaps among `open` and `reserved` slots allows replacement of owner-blocked slots; any future reopen must revalidate conflicts. Reject null/nonfinite times and require positive duration. Precheck existing overlapping rows before adding a constraint; do not silently delete or shift slots. PostgreSQL describes exclusion constraints as cross-row guarantees and cautions against using CHECK constraints for cross-row data. Source: [PostgreSQL constraints](https://www.postgresql.org/docs/current/ddl-constraints.html).

## Confirmed rescheduling and participant consent

Participant consent is a product requirement, not a PostgreSQL or Supabase built-in guarantee. Recommended beta policy: a confirmed booking cannot have its accepted time silently overwritten. Store a separate proposal containing original booking, exact proposed slot/time/price, proposer, revision and state. The other participant explicitly accepts or rejects that revision. Do not infer agreement from a notification, a coach persona, or an earlier unrelated acceptance. This recommendation does not claim any legal conclusion about minors or consent.

Accept atomically: lock affected resources in the common order, verify actor and proposal revision, recheck current booking and target availability, reserve target, release original and record the accepted event. A stale or conflicting proposal must fail without altering the original reservation. Preserve original agreement snapshots and append event history; choose explicitly whether proposal submission holds the target or acceptance competes for it. The transaction and locking mechanism is supported by [PostgreSQL transaction isolation](https://www.postgresql.org/docs/current/transaction-iso.html) and [explicit locking](https://www.postgresql.org/docs/current/explicit-locking.html); the consent workflow itself is a design inference.

## SECURITY DEFINER and grants

Supabase recommends invoker functions by default. Where privileged RPCs need `SECURITY DEFINER`, set `search_path = ''` and schema-qualify every relation and application function (`public.*`, `auth.uid()`, `audit.*`). Empty search path does not authorize callers: check authentication, ownership and transition state inside each RPC. Supabase documents explicit revocation from both PUBLIC and individual restricted roles. Source: [Supabase database functions](https://supabase.com/docs/guides/database/functions#security-definer-vs-invoker).

PostgreSQL grants PUBLIC execution on new functions by default; revoke within the same transaction as creation, then grant only intended execution. Replacing a function preserves existing permissions, so replacement alone does not repair historical grants. Source: [PostgreSQL CREATE FUNCTION](https://www.postgresql.org/docs/current/sql-createfunction.html#SQL-CREATEFUNCTION-SECURITY).

Repository-specific recommendation: match SQL39/40/42 by explicitly revoking browser RPC execution from PUBLIC, anon and service_role, then granting authenticated. Trigger-only helpers should also deny authenticated execution. Verify effective privileges with `has_function_privilege` and inspect function `proconfig` after migration; do not infer privileges solely from the migration text.

## Integration risks in the existing migrations

| Existing source | Finding and implication |
| --- | --- |
| [SQL20](../../sql/20-tournament-roster-flow-v1.sql) | Coach persona permits draft-team creation, but it is not a verified coaching credential. Team membership acceptance is a tournament roster fact, not consent to a booking or reschedule. Submission requires an accepted member; performance insertion checks accepted membership. Preserve these guards. Its legacy definer functions use nonempty search paths; changes require a new migration. |
| [SQL31](../../sql/31-data-trust-foundation-v1.sql) | Provenance subjects are restricted to athlete/profile/rank/result/performance types; venue bookings are not supported subjects. Public accepted-provenance RLS exposes the row, including metadata, so do not put private booking identities, notes or contact information there. Verification history rejects UPDATE/DELETE; amendments should append events. Do not relabel coach-entered claims as performance verification. |
| [SQL23](../../sql/23-venues-and-bookings-v1.sql) | `unique(court_id, starts_at, ends_at)` stops exact duplicates only. Slot creation performs no overlap check or court lock. A partial unique index ensures one live request per slot, but not one live request per physical court interval. |
| [SQL40](../../sql/40-venue-slot-booking-state-v1.sql) | Request locks slot; respond/cancel lock slot before booking. Pending and confirmed bookings both occupy `reserved`. Cancellation currently allows pending only; owner close rejects active bookings. Preserve those guards unless deliberately implementing a new transition. Five snapshot columns preserve private booking history without widening slot RLS. A reschedule must not make the history appear to be the original agreement. |
| [SQL41](../../sql/41-venue-booking-notifications-v1.sql) | Requested notifications run on INSERT; response notifications only react to status changes. Editing time or slot with unchanged status creates no notice. Source keys use booking ID plus outcome, so repeating an outcome on one booking can suppress later messages. New reschedule events need proposal/revision-specific keys and accurate recipients/text. Notification failure rolls back the booking transaction; preserve atomicity and test it. |

## Verification needed before beta use

- Two independent transactions create overlapping slots on one court: only one succeeds. Adjacent slots and simultaneous slots on different courts both succeed.
- Creation versus edit/reopen races cannot leave overlapping active availability; existing overlaps fail the migration precheck.
- Owner/requester/unrelated real JWTs prove direct-table restrictions and RPC actor checks; anon cannot execute write RPCs.
- Confirmed booking time remains unchanged when a proposal is rejected, stale, unauthorized, expired or conflicts at acceptance.
- Concurrent proposal accept/cancel and booking request/owner close leave a consistent slot and booking state.
- History retains the original agreement; new notices contain no private note/contact details, de-duplicate per event revision and roll back with the mutation on failure.

These are proposed checks, not executed results. This note does not establish live deployment state or readiness with real beta users.
