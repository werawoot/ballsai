import { describe, expect, it } from 'vitest'
import { cardPosition, positionLabel } from '@/lib/player-card'

// A position the athlete never chose is not shown as one and never saved as one (rule 8):
// /card used to fall back to "MF", show it, and write it to the profile on save (UX audit 7).
describe('the position on a Player Card', () => {
  it('takes the first position on record: rank, athlete profile, then account', () => {
    expect(cardPosition('GK', 'FW', 'DF')).toBe('GK')
    expect(cardPosition(null, 'FW', 'DF')).toBe('FW')
    expect(cardPosition(undefined, '', 'DF')).toBe('DF')
  })
  it('is empty, not MF, when none was chosen', () => {
    expect(cardPosition(null, null, undefined)).toBe('')
  })
  it('shows a dash for an empty position', () => {
    expect(positionLabel('')).toBe('—')
    expect(positionLabel('MF')).toBe('MF')
  })
})
