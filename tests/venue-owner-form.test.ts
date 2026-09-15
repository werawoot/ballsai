import { describe, expect, it } from 'vitest'
import { resolveCourtId, resolveVenueId } from '@/lib/venue-owner-form'

describe('venue owner form selection', () => {
  it('uses the first current venue when the form was mounted before a venue existed', () => {
    expect(resolveVenueId('', [{ id: 'venue-1' }])).toBe('venue-1')
  })

  it('uses the first current court when the form was mounted before a court existed', () => {
    expect(resolveCourtId('', [{ id: 'court-1' }])).toBe('court-1')
  })

  it('keeps the explicit selection when it is available', () => {
    expect(resolveVenueId('venue-2', [{ id: 'venue-1' }])).toBe('venue-2')
    expect(resolveCourtId('court-2', [{ id: 'court-1' }])).toBe('court-2')
  })
})
