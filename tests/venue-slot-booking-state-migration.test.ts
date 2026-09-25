import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migrationPath = new URL('../sql/40-venue-slot-booking-state-v1.sql', import.meta.url)
const sql = readFileSync(migrationPath, 'utf8')
const precheck = readFileSync(new URL('../sql/40-venue-slot-booking-state-precheck.sql', import.meta.url), 'utf8')
const postcheck = readFileSync(new URL('../sql/40-venue-slot-booking-state-postcheck.sql', import.meta.url), 'utf8')
const migrationFunction = (name: string) => sql.match(
  new RegExp(`create or replace function public\\.${name}[\\s\\S]*?\\n\\$\\$;`),
)?.[0]

describe('venue slot booking state migration', () => {
  it('uses reserved for bookings without conflating an owner-blocked slot', () => {
    expect(sql).toContain("check (status in ('open', 'blocked', 'reserved'))")
    expect(migrationFunction('request_venue_booking_safely')).toContain("set status = 'reserved'")
    expect(migrationFunction('respond_venue_booking_safely')).toContain("set status = 'reserved'")
    expect(migrationFunction('respond_venue_booking_safely')).toContain("set status = 'open'")
    expect(migrationFunction('cancel_venue_booking_safely')).toContain("set status = 'open'")
    expect(sql).toContain("set status = 'reserved'\nwhere s.status = 'open'")
    expect(sql).toContain('SQL40 found an active booking on a blocked slot')
  })

  it('requires an authenticated session before an owner can respond', () => {
    expect(migrationFunction('respond_venue_booking_safely')).toContain('AUTH_REQUIRED')
  })

  it('stores booking display data without granting historical slot visibility', () => {
    expect(sql).toContain('venue_name_snapshot text')
    expect(sql).toContain('slot_starts_at_snapshot timestamptz')
    expect(sql).toContain('price_baht_snapshot integer')
    expect(migrationFunction('request_venue_booking_safely')).toContain('venue_name_snapshot')
    expect(sql).not.toContain('is_venue_slot_requester')
    expect(sql).not.toContain('venue_slots_select_requester')
  })

  it('keeps owner-closed and booking-reserved close outcomes distinct', () => {
    const closeRpc = migrationFunction('close_venue_slot_safely') ?? ''
    const reservedCheck = closeRpc.indexOf("if v_status = 'reserved'")
    const genericClosedCheck = closeRpc.indexOf("if v_status <> 'open'")

    expect(reservedCheck).toBeGreaterThan(-1)
    expect(genericClosedCheck).toBeGreaterThan(reservedCheck)
    expect(closeRpc).toContain('SLOT_HAS_ACTIVE_BOOKING')
    expect(closeRpc).toContain("set status = 'blocked'")
  })

  it('reasserts authenticated-only execution for every replaced rpc', () => {
    for (const signature of [
      'request_venue_booking_safely(uuid, text, text)',
      'respond_venue_booking_safely(uuid, text)',
      'cancel_venue_booking_safely(uuid)',
      'close_venue_slot_safely(uuid)',
    ]) {
      expect(sql).toContain(`revoke all on function public.${signature} from anon;`)
      expect(sql).toContain(`revoke all on function public.${signature} from service_role;`)
      expect(sql).toContain(`grant execute on function public.${signature} to authenticated;`)
    }
  })

  it('keeps production verification scripts read-only and covers the new invariants', () => {
    for (const checkSql of [precheck, postcheck]) {
      const executable = checkSql
        .split('\n')
        .filter(line => !line.trimStart().startsWith('--'))
        .join('\n')
      expect(executable).not.toMatch(/\b(insert|update|delete|create|alter|drop|truncate|grant|revoke|call)\b/i)
    }

    expect(precheck).toContain('blocked_slots_baseline')
    expect(precheck).toContain('booking_rows_missing_source_data')
    expect(postcheck).toContain('reserved_slots_without_active_booking')
    expect(postcheck).toContain('booking_rows_missing_snapshot')
    expect(postcheck).not.toContain('is_venue_slot_requester')
  })
})
