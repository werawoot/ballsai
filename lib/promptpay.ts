// The PromptPay number of a tournament: a 10-digit phone number or a 13-digit ID, typed with
// or without dashes and spaces. A tournament with a fee must have one, or a team reaches the
// payment step with nowhere to pay. Returns the apiErrors code for what is wrong, or null.
export type PromptpayIssue = 'promptpayRequired' | 'promptpayInvalid'

export function promptpayIssue(fee: number, promptpay: string): PromptpayIssue | null {
  const digits = promptpay.replace(/[\s-]/g, '')
  if (!digits) return fee > 0 ? 'promptpayRequired' : null
  return /^(\d{10}|\d{13})$/.test(digits) ? null : 'promptpayInvalid'
}
