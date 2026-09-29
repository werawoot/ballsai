// Sends a browser crash to /api/client-errors so it shows up in the server logs (T30).
// Best effort: a failed report must never break the error screen itself.
export function reportClientError(error: Error & { digest?: string }) {
  try {
    const body = JSON.stringify({ message: error.message || error.name || 'Unknown error', digest: error.digest ?? null, path: window.location.pathname })
    if (navigator.sendBeacon) navigator.sendBeacon('/api/client-errors', new Blob([body], { type: 'application/json' }))
    else void fetch('/api/client-errors', { method: 'POST', headers: { 'content-type': 'application/json' }, body, keepalive: true }).catch(() => {})
  } catch {
    // Reporting is optional.
  }
}
