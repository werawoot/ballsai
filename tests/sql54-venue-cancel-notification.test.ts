import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (name: string) => readFileSync(new URL(`../sql/${name}`, import.meta.url), 'utf8')
const code = (name: string) => read(name).split('\n').filter(line => !line.trimStart().startsWith('--')).join('\n')
const raw = code('54-venue-cancel-notification-fix-v1.sql')
const migration = raw.replace(/\s+/g, ' ')

// SQL41 told the venue owner "the requester cancelled" for every cancelled booking. SQL46
// adds a second way to cancel: a confirmed booking is cancelled when one side proposes it
// and the other accepts. Then the owner was told the requester cancelled even when the
// owner had proposed it, and the requester was never told the booking was cancelled.
describe('SQL54 venue booking cancellation notices', () => {
  it('keeps the requester-withdrew notice for a pending request, with its old key', () => {
    expect(migration).toMatch(/old\.status = 'pending'/)
    expect(migration).toContain("'ผู้ขอยกเลิกคำขอจอง'")
    expect(migration).toContain("'venue_booking_cancelled:' || new.id::text")
  })

  it('tells the other side of an agreed cancellation, whoever proposed it', () => {
    expect(migration).toMatch(/old\.status = 'confirmed'/)
    expect(migration).toContain('auth.uid()')
    expect(migration).toContain("'venue_booking_cancel_agreed:' || new.id::text || ':' ||")
    expect(migration).not.toMatch(/'ผู้ขอยกเลิก[^']*'[^;]*cancel_agreed/)
  })

  it('leaves the confirmed and declined notices exactly as SQL41 wrote them', () => {
    for (const text of ["'เจ้าของสนามยืนยันการจองแล้ว'", "'venue_booking_confirmed:'", "'คำขอจองถูกปฏิเสธ'", "'venue_booking_declined:'"]) expect(migration).toContain(text)
  })

  it('keeps the trigger function out of every client role and checks itself', () => {
    expect(migration).toMatch(/revoke all on function public\.notify_venue_booking_responded\(\) from public, anon, authenticated, service_role/i)
    expect(raw).toMatch(/^begin;/m)
    expect(migration).toMatch(/raise exception/)
    expect(raw).toMatch(/^commit;\s*$/m)
  })

  it.each(['54-venue-cancel-notification-fix-precheck.sql', '54-venue-cancel-notification-fix-postcheck.sql'])('%s only reads', name => {
    expect(code(name)).toMatch(/\bselect\b/i)
    expect(code(name)).not.toMatch(/^\s*(insert|update|delete|alter|drop|create|grant|revoke|truncate|do)\b/im)
  })
})
