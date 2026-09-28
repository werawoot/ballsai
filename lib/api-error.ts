import { NextResponse } from 'next/server'
import th from '@/messages/th.json'

// An API error the page can word in the reader's language. `code` is a key of
// apiErrors in messages/*.json; `error` stays the Thai sentence, word for word, for
// clients that still show it as sent (older screens and the mobile app). See ADR-009.
export type ApiErrorCode = keyof typeof th.apiErrors

export function apiError(code: ApiErrorCode, status: number, extra: Record<string, string> = {}) {
  return NextResponse.json({ error: th.apiErrors[code], code, ...extra }, { status })
}
