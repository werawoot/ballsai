// What the organiser's approval card offers for one pending team. confirm_payment_safely
// (production-hardening.sql) confirms the payment AND the team in one transaction, so a
// payment waiting for review needs a single tap. Confirming the team alone is left for the
// cases with no payment to review: a tournament with no fee, or a payment already confirmed.
export type ApprovalAction = 'confirmPayment' | 'confirmTeam' | 'waitSlip'

export function approvalAction(fee: number | null | undefined, payment: { status: string } | null): ApprovalAction {
  if (payment?.status === 'pending') return 'confirmPayment'
  if (payment?.status === 'confirmed') return 'confirmTeam'
  // No payment to review (none sent, or one that was rejected): a fee means wait for the
  // slip; no fee means there is nothing to wait for. An unknown fee keeps the old behaviour.
  return fee != null && fee > 0 ? 'waitSlip' : 'confirmTeam'
}
