// The text for an API error body on a screen (ADR-009). The server sends the Thai sentence
// in `error` and, for routes that have been converted, a `code` that is a key of apiErrors
// in messages/*.json. `translate` returns the reader's wording for a code it knows, or null.
export function apiErrorText(
  body: { error?: string; code?: string } | null,
  translate: (code: string) => string | null,
  fallback: string,
): string {
  const worded = body?.code ? translate(body.code) : null
  return worded ?? body?.error ?? fallback
}
