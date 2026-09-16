# Venue Owner Flow — Closed Beta v1

This is the smallest useful venue workflow for BallDoenSai:

```text
Owner creates venue -> adds playable space -> publishes a future slot
-> signed-in athlete/coach requests the slot -> owner confirms or declines
```

## Included

- Venue profile: name, province, address, contact phone, description and amenities.
- One or more football/futsal spaces inside the venue.
- One-off future slots with a fixed displayed price.
- Signed-in users can request one available slot.
- Owners see incoming requests and confirm or decline them.
- The requester can cancel a pending request.
- Owners can close an open slot that has no pending or confirmed booking. The owner's
  booking inbox lists only requests made against their own venues.

## Deliberately excluded from this beta

- Payment, escrow, receipts, payout and cancellation fees.
- Recurring availability, dynamic pricing and calendar integrations.
- Venue photos, reviews, staff accounts, multiple branches and public SEO pages.
- Automatic tournament booking. Organizers can use the confirmed reservation as an operational agreement, then enter the tournament location normally.

## Safety rules

- A venue belongs to the authenticated owner who created it; no `profiles.role`
  promotion is required.
- Writes run only through guarded RPCs. RLS permits reading only published venues,
  their active spaces/slots, and a booking's two participants.
- A partial unique index permits at most one `pending` or `confirmed` request per
  slot. SQL40 adds the distinct `reserved` state while either booking state is active,
  so a reservation is never confused with an owner closing a slot. Declining or
  cancelling atomically reopens the slot; confirming keeps it reserved.
- Each request snapshots the venue name, court name, time and displayed price. This
  keeps the requester's private history readable after the live slot is hidden without
  granting permanent RLS access to declined, cancelled or historic slot rows.
- Closing a slot uses `close_venue_slot_safely()`. It locks the slot and refuses to
  close it while a pending or confirmed request exists, so no active booking is orphaned.
- Closing is a status change, not a deletion. `DELETE /api/venue-slots/:slotId` moves the
  slot to `blocked`; a live booking moves it to `reserved`. The row, its price and its history stay in `venue_slots`, and any
  declined or cancelled request that pointed at it is preserved.
- An admin may close another owner's slot. That override is written to the SQL35 admin
  audit trail (`venue.slot.close`) inside the same transaction, so the close and its
  audit record succeed or fail together. An owner closing their own slot is not audited.
- SQL steps 23 and 24 must be applied and verified in the target project before
  deploying or onboarding a venue owner. Applying them is an authorised operator action
  with explicit production approval, never an automatic repair step.
- SQL step 38 is required before the close-slot control works, and depends on SQL23,
  SQL33 and SQL35. Run the read-only `sql/38-close-venue-slot-precheck.sql` first to
  confirm those prerequisites on the target project. Until it is applied the API returns **HTTP 503** naming
  `sql/38-close-venue-slot-v1.sql` rather than failing silently, and the existing
  create/request/respond flow remains unchanged.
- SQL step 40 must be preceded by its read-only precheck and by deployment of the
  backward-compatible `/venues/bookings` reader. It depends on SQL23, SQL38 and SQL39.
  A passing precheck is not authorisation to apply it.

## Notifications (SQL41, pending approval)

- A new request notifies the venue owner; a confirm or decline notifies the requester;
  a cancellation notifies the owner, who needs to know the slot reopened.
- Every notification carries the venue name, the space name and the slot time only. It
  never carries the requester's identity, the booking purpose, the note, or a contact
  number: the owner opens the booking inbox for those, where RLS still applies.
- The requester's notification reads the immutable SQL40 snapshot columns, so the text
  does not change afterwards.
- Repeating a confirm creates no second notification: the status does not change, so the
  trigger does not fire, and the SQL17 unique `source_key` is the backstop.
- Requesting the same slot again after a decline is a new booking row, so it does
  produce a new notification. That is intended.

## Manual beta script

1. Use a venue-owner account to create a venue, a court and a slot tomorrow.
2. Use a separate athlete or coach account to open `/venues`, select the slot and send a request.
3. Confirm from `/venue`; the requester must see `ยืนยันแล้ว` in `/venues/bookings`.
4. Repeat with a declined request, then verify another request can be made for the same slot.
5. Verify an unrelated signed-in account cannot see the owner's request list.
6. Open a second unbooked slot, close it from `/venue`, and verify it disappears
   from `/venues`. Also verify that a slot with a pending request cannot be closed and
   that the refusal is shown as a red error banner, not a green confirmation.
7. Sign in as the venue owner and send a booking request to a *different* owner's venue.
   The request must appear in `/venues/bookings` and must not appear in the owner's
   `/venue` booking inbox or its pending counter.
