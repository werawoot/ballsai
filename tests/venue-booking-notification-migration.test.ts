import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  VENUE_BOOKING_HREF,
  VENUE_BOOKING_NOTIFICATION_TYPE,
  VENUE_BOOKING_SOURCE_PREFIX,
  VENUE_BOOKING_TIME_ZONE,
  VENUE_BOOKING_TRANSITIONS,
} from '@/lib/venue-booking-notification'

const read = (name: string) => readFileSync(new URL(`../sql/${name}`, import.meta.url), 'utf8')

const migration = read('41-venue-booking-notifications-v1.sql')

// SQL41 and lib/venue-booking-notification.ts are two independent implementations of
// one contract: the database writes the rows, the helper describes what the app expects
// to find. These assertions are what keeps the two from drifting apart.
const functionBody = (name: string) =>
  migration.match(new RegExp(`create or replace function public\\.${name}[\\s\\S]*?\\n\\$\\$;`))?.[0]

describe('SQL41 venue booking notifications', () => {
  it('is a new migration and never redefines an applied venue rpc', () => {
    for (const rpc of [
      'request_venue_booking_safely',
      'respond_venue_booking_safely',
      'cancel_venue_booking_safely',
      'close_venue_slot_safely',
      'create_notification',
    ]) {
      expect(migration).not.toContain(`create or replace function public.${rpc}`)
    }
  })

  it('adds the notification type the helper uses without dropping the applied ones', () => {
    expect(migration).toContain(`'${VENUE_BOOKING_NOTIFICATION_TYPE}'`)
    for (const existing of ['match_result', 'badge_earned', 'team_status', 'team_invite', 'guardian_link']) {
      expect(migration).toContain(`'${existing}'`)
    }
  })

  it('uses exactly the source-key prefixes the helper builds', () => {
    for (const transition of VENUE_BOOKING_TRANSITIONS) {
      expect(migration).toContain(`${VENUE_BOOKING_SOURCE_PREFIX[transition]}:`)
    }
  })

  it('routes each side to the href the helper expects', () => {
    expect(migration).toContain(`'${VENUE_BOOKING_HREF.owner}'`)
    expect(migration).toContain(`'${VENUE_BOOKING_HREF.requester}'`)
  })

  it('drives notifications from triggers on venue_booking_requests', () => {
    expect(migration).toContain('after insert on public.venue_booking_requests')
    expect(migration).toContain('after update of status on public.venue_booking_requests')
  })

  it('hardens both trigger functions', () => {
    for (const name of ['notify_venue_booking_requested', 'notify_venue_booking_responded']) {
      const body = functionBody(name)
      expect(body, `${name} must exist`).toBeTruthy()
      expect(body).toContain('security definer')
      expect(body).toContain("set search_path = ''")
    }
  })

  it('ignores an update that does not actually change the status', () => {
    expect(functionBody('notify_venue_booking_responded')).toContain('is not distinct from old.status')
  })

  it('covers every booking status the flow can reach', () => {
    const responded = functionBody('notify_venue_booking_responded') ?? ''
    for (const status of ['confirmed', 'declined', 'cancelled']) {
      expect(responded).toContain(`'${status}'`)
    }
  })

  it('reads the immutable SQL40 snapshot instead of joining live venue rows', () => {
    const responded = functionBody('notify_venue_booking_responded') ?? ''
    expect(responded).toContain('venue_name_snapshot')
    expect(responded).toContain('court_name_snapshot')
  })

  it('puts the slot date and time in every notification body', () => {
    // The body has to say WHEN the slot is, on all four transitions. Both trigger
    // functions must read the immutable snapshot column, never the live slot row.
    for (const name of ['notify_venue_booking_requested', 'notify_venue_booking_responded']) {
      const body = functionBody(name) ?? ''
      expect(body, `${name} must read the snapshot time`).toContain('slot_starts_at_snapshot')
      expect(body, `${name} must not join the live slot time`).not.toContain('s.starts_at')
    }
  })

  it('renders the slot time in Asia/Bangkok rather than the server time zone', () => {
    for (const name of ['notify_venue_booking_requested', 'notify_venue_booking_responded']) {
      const body = functionBody(name) ?? ''
      expect(body, `${name} must localise the slot time`)
        .toContain(`at time zone '${VENUE_BOOKING_TIME_ZONE}'`)
    }
  })

  it('formats the slot time without reintroducing private booking fields', () => {
    const requested = functionBody('notify_venue_booking_requested') ?? ''
    expect(requested).toContain('to_char')
    expect(requested).not.toContain('requester_id')
  })

  it('never puts requester free text or a contact number into a notification', () => {
    expect(migration).not.toContain('new.purpose')
    expect(migration).not.toContain('new.note')
    expect(migration).not.toContain('contact_phone')
  })

  it('keeps the precheck and postcheck read-only', () => {
    for (const name of [
      '41-venue-booking-notifications-precheck.sql',
      '41-venue-booking-notifications-postcheck.sql',
    ]) {
      const statements = read(name)
        .split('\n')
        .filter(line => !line.trimStart().startsWith('--'))
        .filter(line => line.trim().length > 0)

      expect(statements.some(line => line.startsWith('select'))).toBe(true)
      for (const line of statements) {
        expect(line).not.toMatch(/^\s*(insert|update|delete|create|alter|drop|truncate|grant|revoke|call|do)\b/i)
      }
    }
  })

  it('makes the precheck prove every booking already has a snapshot time', () => {
    const precheck = read('41-venue-booking-notifications-precheck.sql')

    expect(precheck).toContain('slot_starts_at_snapshot is null')
    expect(precheck).toContain('rows_missing_snapshot_time')
  })

  it('checks its prerequisites and verifies its own privileges', () => {
    expect(migration).toContain('to_regclass')
    expect(migration).toContain('to_regprocedure')
    expect(migration).toContain('has_function_privilege')
  })
})
