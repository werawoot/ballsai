type RateLimitOptions = {
  scope: string
  limit: number
  windowSeconds: number
}

type RateLimitResult = {
  allowed: boolean
  retryAfterSeconds: number
}

type Bucket = { count: number; resetAt: number }

const localBuckets = new Map<string, Bucket>()

function clientAddress(request: Request) {
  return request.headers.get('cf-connecting-ip')
    ?? request.headers.get('x-real-ip')
    ?? request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    ?? 'unknown'
}

function checkLocalRateLimit(key: string, limit: number, windowSeconds: number): RateLimitResult {
  const now = Date.now()
  const existing = localBuckets.get(key)
  const bucket = !existing || existing.resetAt <= now
    ? { count: 0, resetAt: now + windowSeconds * 1000 }
    : existing

  bucket.count += 1
  localBuckets.set(key, bucket)
  return {
    allowed: bucket.count <= limit,
    retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
  }
}

async function checkUpstashRateLimit(key: string, limit: number, windowSeconds: number): Promise<RateLimitResult | null> {
  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) return null

  try {
    const response = await fetch(`${url}/pipeline`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify([
        ['INCR', key],
        ['EXPIRE', key, String(windowSeconds), 'NX'],
        ['TTL', key],
      ]),
      cache: 'no-store',
    })
    if (!response.ok) return null

    const results = await response.json() as Array<{ result?: number }>
    const count = Number(results[0]?.result)
    const ttl = Number(results[2]?.result)
    if (!Number.isFinite(count)) return null

    return {
      allowed: count <= limit,
      retryAfterSeconds: Math.max(1, Number.isFinite(ttl) && ttl > 0 ? ttl : windowSeconds),
    }
  } catch {
    return null
  }
}

export async function checkRateLimit(request: Request, options: RateLimitOptions): Promise<RateLimitResult> {
  const key = `balldoensai:rate-limit:${options.scope}:${clientAddress(request)}`
  return (await checkUpstashRateLimit(key, options.limit, options.windowSeconds))
    ?? checkLocalRateLimit(key, options.limit, options.windowSeconds)
}
