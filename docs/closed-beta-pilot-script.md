# Closed Beta pilot script — first six accounts

Use only the named accounts in `closed-beta-test-accounts.csv` and a disposable
tournament. Do not use a production child profile without the account owner's consent.

## Setup owner

1. Fill in each account email and a human owner in the CSV; do not commit it once it
   contains personal emails.
2. Each person signs in themselves using the approved login method. Record pass/fail
   only — never record OTPs, passwords or session links.
3. An existing administrator assigns the `admin` and `organizer` role to their
   dedicated test accounts using the established internal procedure. Do not use the
   Admin account for Athlete or Guardian checks.
4. Create exactly one disposable tournament and two disposable teams. Give them an
   unmistakable test name such as `CB-2026-W1-DELETE-AFTER-PILOT`.

## Test sequence

| Step | Account | Action | Evidence required |
| --- | --- | --- | --- |
| 1 | all | Sign in with Google, Facebook and Email OTP across the cohort | Each account reaches its correct next screen; a new Athlete reaches `/welcome` once only. |
| 2 | Athlete 01–03 | Complete profile/Card | Profile source labels do not impersonate verified performance; no Ranking reads as `STARTER/UNRATED`. |
| 3 | Organizer | Invite Athlete 01, 02 and 03 | Notifications name the correct team and tournament. |
| 4 | Athlete 01/03 | Accept | Organizer sees them as accepted; they become selectable for Match Plan/results. |
| 5 | Athlete 02 | Decline | Athlete 02 is not selectable in the team roster, Match Plan or results. |
| 6 | Organizer | Submit accepted team and upload a test slip | Slip is visible to the authorized organizer through a signed link only. |
| 7 | Admin/Organizer | Confirm payment/team | Correct account receives its notification. |
| 8 | Organizer | Save Match Plan | Only accepted members can be placed as starter/substitute. |
| 9 | Organizer | Record one result | Correct Athlete accounts receive performance, Rating/XP/Badge/Career/Ranking effects. |
| 10 | Organizer | Void the same result | The approved reversible effects return without direct database editing. |
| 11 | Guardian | Link to the consented Athlete only | Guardian cannot view another Athlete by guessing an ID. |
| 12 | Athlete/Admin | Open a highlight report and deletion request using disposable data | Moderation/deletion queues show the request only to Admin. |

## Stop conditions

Stop the pilot and record a Severity 1/2 issue if any account can access another
person's private data, a raw slip link works without authorization, a minor profile
publishes without consent, or a recorded result/void produces unrecoverable identity
data. Do not repair production rows manually; preserve the error details for review.

## Pilot completion record

- Pilot date/time:
- Build/deployment identifier:
- Accounts participating (labels only):
- Tests passed/failed:
- Incident links or screenshots with personal information redacted:
- Decision: repeat with 5 testers / expand to 20 / no-go:
