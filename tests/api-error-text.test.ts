import { describe, expect, it } from 'vitest'
import { apiErrorText } from '@/lib/api-error-text'

// The server sends { error: <Thai sentence>, code }. A screen shows the sentence in the
// reader's language when it knows the code, and the sentence as sent when it does not.
const known = (code: string) => (code === 'playerGoalsOverScore' ? 'Players\' goals add up to more than the score.' : null)

describe('apiErrorText', () => {
  it('words a known code in the reader\'s language', () => {
    expect(apiErrorText({ error: 'ประตูเกิน', code: 'playerGoalsOverScore' }, known, 'failed')).toBe('Players\' goals add up to more than the score.')
  })
  it('shows the sentence as sent when the code is not known to this screen', () => {
    expect(apiErrorText({ error: 'ไม่พบรายการแข่งขัน', code: 'other' }, known, 'failed')).toBe('ไม่พบรายการแข่งขัน')
  })
  it('shows the sentence as sent when there is no code (older routes)', () => {
    expect(apiErrorText({ error: 'ไม่มีสิทธิ์บันทึกผลแข่ง' }, known, 'failed')).toBe('ไม่มีสิทธิ์บันทึกผลแข่ง')
  })
  it('falls back when the body is not usable', () => {
    expect(apiErrorText(null, known, 'failed')).toBe('failed')
    expect(apiErrorText({}, known, 'failed')).toBe('failed')
  })
})
