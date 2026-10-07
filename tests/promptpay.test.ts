import { describe, expect, it } from 'vitest'
import { promptpayIssue } from '@/lib/promptpay'

// A tournament with a fee needs a PromptPay number, or a team reaches the payment step with
// nowhere to pay (UX audit flow 4, issue 5; found again creating the first real tournament).
describe('promptpayIssue', () => {
  it('asks for a number when there is a fee', () => {
    expect(promptpayIssue(100, '')).toBe('promptpayRequired')
    expect(promptpayIssue(100, '   ')).toBe('promptpayRequired')
  })
  it('accepts a phone number or a 13-digit ID, with or without dashes and spaces', () => {
    expect(promptpayIssue(100, '081-234-5678')).toBeNull()
    expect(promptpayIssue(100, '0812345678')).toBeNull()
    expect(promptpayIssue(100, '1 2345 67890 12 3')).toBeNull()
  })
  it('refuses something that is not a PromptPay number', () => {
    expect(promptpayIssue(100, '12345')).toBe('promptpayInvalid')
    expect(promptpayIssue(100, 'abc-def-ghij')).toBe('promptpayInvalid')
    expect(promptpayIssue(0, '12345')).toBe('promptpayInvalid')
  })
  it('needs nothing for a free tournament', () => {
    expect(promptpayIssue(0, '')).toBeNull()
  })
})
