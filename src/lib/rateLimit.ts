// Simple in-memory rate limiter. Persists within a warm serverless instance.
// Good enough for a small-traffic pub app — no Redis needed.

interface Bucket {
  count: number
  resetAt: number
}

const store = new Map<string, Bucket>()

// Returns true if the request is allowed, false if rate-limited.
export function checkRateLimit(key: string, maxRequests: number, windowMs: number): boolean {
  const now = Date.now()
  const bucket = store.get(key)

  if (!bucket || now > bucket.resetAt) {
    store.set(key, { count: 1, resetAt: now + windowMs })
    return true
  }

  if (bucket.count >= maxRequests) return false

  bucket.count++
  return true
}

export function getIp(req: Request): string {
  const fwd = (req.headers as Headers).get('x-forwarded-for')
  return fwd?.split(',')[0]?.trim() || 'unknown'
}
