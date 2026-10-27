import type { ApiErrorCode } from '@/lib/api-error'
import { canonicalProvince } from '@/lib/thai-provinces'

// Organizer access requests (ADR-013, sql/89). The database holds every rule; this module
// repeats the form rules so the page can say which field is wrong before a round trip, and
// turns the account's request history into the one thing the page should show.

export const ORG_TYPES = ['school', 'association', 'club', 'independent'] as const
export type OrgType = (typeof ORG_TYPES)[number]
export const APPLICANT_DRAFT_LIMIT = 3
export const REQUEST_COOLDOWN_DAYS = 7
const DAY_MS = 86_400_000

export type OrganizerRequestInput = { orgName: string; orgType: string; province: string; phone: string; note: string }
export type OrganizerRequestField = keyof OrganizerRequestInput

export function normalisePhone(raw: string) {
  return raw.replace(/[^0-9+]/g, '')
}

export function organizerRequestIssue(input: OrganizerRequestInput): OrganizerRequestField | null {
  const name = input.orgName.trim()
  if (name.length < 2 || name.length > 120) return 'orgName'
  if (!(ORG_TYPES as readonly string[]).includes(input.orgType)) return 'orgType'
  if (!canonicalProvince(input.province.trim())) return 'province'
  if (!/^\+?[0-9]{9,15}$/.test(normalisePhone(input.phone))) return 'phone'
  if (input.note.length > 500) return 'note'
  return null
}

export type OrganizerRequestRow = {
  id: string
  status: string
  created_at: string
  decided_at: string | null
  decision_reason: string | null
}

export type OrganizerAccessState =
  | { kind: 'organizer' }
  | { kind: 'pending'; requestId: string; since: string }
  | { kind: 'cooldown'; until: Date; reason: string | null }
  | { kind: 'can_request'; lastReason: string | null }

// `requests` newest first. The 7-day wait counts from the later of the last decline and
// the last revocation, as request_organizer_access() does.
export function organizerAccessState({ role, requests, lastRevocationAt, now }: {
  role: string | null | undefined
  requests: OrganizerRequestRow[]
  lastRevocationAt: string | null
  now: Date
}): OrganizerAccessState {
  if (role === 'organizer' || role === 'admin') return { kind: 'organizer' }
  const pending = requests.find(request => request.status === 'pending')
  if (pending) return { kind: 'pending', requestId: pending.id, since: pending.created_at }
  const declined = requests.find(request => request.status === 'declined')
  const revoked = requests.find(request => request.status === 'revoked')
  const times = [declined?.decided_at, lastRevocationAt].filter((at): at is string => Boolean(at)).map(at => Date.parse(at))
  const latest = requests[0]
  const lastReason = latest && (latest.status === 'declined' || latest.status === 'revoked') ? latest.decision_reason : (declined ?? revoked)?.decision_reason ?? null
  if (times.length) {
    const until = new Date(Math.max(...times) + REQUEST_COOLDOWN_DAYS * DAY_MS)
    if (until > now) return { kind: 'cooldown', until, reason: lastReason }
  }
  return { kind: 'can_request', lastReason }
}

// An organizer's new tournament opens unless they keep it as a draft; anyone else's is a
// draft (the database refuses it without a pending request).
export function createStatusFor(role: string | null | undefined, wantsDraft: boolean): 'open' | 'draft' {
  return (role === 'organizer' || role === 'admin') && !wantsDraft ? 'open' : 'draft'
}

const REFUSALS: Array<[string, ApiErrorCode]> = [
  ['ORGANIZER_REQUEST_REQUIRED', 'organizerRequestRequired'],
  ['ORGANIZER_REQUIRED', 'organizerRequired'],
  ['REQUEST_PENDING', 'organizerRequestPending'],
  ['REQUEST_TOO_SOON', 'organizerRequestTooSoon'],
  ['ALREADY_ORGANIZER', 'alreadyOrganizer'],
  ['ALREADY_DECIDED', 'organizerRequestDecided'],
  ['REQUEST_NOT_FOUND', 'organizerRequestNotFound'],
  ['NOT_ORGANIZER', 'notOrganizerAccount'],
  ['DRAFT_LIMIT', 'draftLimit'],
  ['CANNOT_RETURN_TO_DRAFT', 'cannotReturnToDraft'],
  ['REASON_REQUIRED', 'reasonRequired'],
  ['INVALID_REQUEST', 'requestInvalid'],
  ['INVALID_DECISION', 'requestInvalid'],
  ['FORBIDDEN', 'notAllowed'],
]

const STATUS: Partial<Record<ApiErrorCode, number>> = {
  organizerRequestRequired: 403, organizerRequired: 403, notAllowed: 403, notOrganizerAccount: 409,
  organizerRequestNotFound: 404, reasonRequired: 400, requestInvalid: 400, featureNotReady: 503,
}

export function organizerRpcError(error: { code?: string | null; message?: string | null }): { code: ApiErrorCode; status: number } | null {
  if (['PGRST202', '42883', '42P01'].includes(error.code ?? '')) return { code: 'featureNotReady', status: 503 }
  const message = error.message ?? ''
  const hit = REFUSALS.find(([word]) => message.includes(word))
  if (!hit) return null
  return { code: hit[1], status: STATUS[hit[1]] ?? 409 }
}
