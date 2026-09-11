import { createHash, randomBytes } from 'crypto'

export function createGuardianToken() {
  return randomBytes(32).toString('base64url')
}

export function hashGuardianToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

export function guardianPublicUrl(pathname: '/guardian/verify' | '/guardian/revoke', token: string) {
  const configuredUrl = process.env.NEXT_PUBLIC_APP_URL
  if (!configuredUrl) return null

  let url: URL
  try {
    url = new URL(configuredUrl)
  } catch {
    return null
  }
  if (url.protocol !== 'https:') return null

  url.pathname = pathname
  url.search = new URLSearchParams({ token }).toString()
  return url.toString()
}
