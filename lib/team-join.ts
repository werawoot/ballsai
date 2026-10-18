// Team join links, requests, leaving and removal (ADR-011, sql/83).

export const JOIN_TOKEN = /^[0-9a-f]{32}$/
export const isJoinToken = (value: unknown): value is string => typeof value === 'string' && JOIN_TOKEN.test(value)

// The reasons a coach may give for removing an athlete; 'other' needs a short note.
export const REMOVAL_REASONS = ['moved_team', 'asked_to_leave', 'inactive', 'other'] as const
export type RemovalReason = (typeof REMOVAL_REASONS)[number]
export const REMOVAL_NOTE_MAX = 200
export const isRemovalReason = (value: unknown): value is RemovalReason => REMOVAL_REASONS.includes(value as RemovalReason)

// The note kept with a removal: only for 'other', trimmed; null when it does not belong.
export function removalNote(reason: RemovalReason, note: unknown): string | null | undefined {
  if (reason !== 'other') return null
  const text = typeof note === 'string' ? note.trim().replace(/\s+/g, ' ') : ''
  return text && [...text].length <= REMOVAL_NOTE_MAX ? text : undefined
}

export const joinPath = (token: string) => `/join/${token}`

// LINE's share page opens the chat picker with this text in it.
export const lineShareUrl = (text: string) => `https://line.me/R/share?text=${encodeURIComponent(text)}`

export type JoinRequestRow = {
  request_id: string
  athlete_id: string
  display_name: string | null
  athlete_position: string | null
  birth_year: number | null
  created_at: string
}

export type ChildTeamRow = { member_id: string; athlete_id: string; athlete_name: string | null; team_name: string; status: string }

// One call to /api/team-join; `body` carries the error code a page words with useApiErrorText.
export async function postTeamJoin(action: string, data: Record<string, unknown>) {
  const response = await fetch('/api/team-join', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, data }),
  }).catch(() => null)
  const body = response ? await response.json().catch(() => null) : null
  return { ok: Boolean(response?.ok), body: body as { data?: unknown; code?: string; error?: string } | null }
}
