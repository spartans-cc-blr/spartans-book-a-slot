import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'
import { NextRequest, NextResponse } from 'next/server'

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
})

export interface RateLimitConfig {
  prefix: string
  limit: number
  windowSecs: number
}

// Ratelimit instances are created once at module level (not per request)
const limiters = new Map<string, Ratelimit>()

function getLimiter(config: RateLimitConfig): Ratelimit {
  const key = `${config.prefix}:${config.limit}:${config.windowSecs}`
  if (!limiters.has(key)) {
    limiters.set(key, new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(config.limit, `${config.windowSecs} s`),
      prefix: `spartans:rl:${config.prefix}`,
    }))
  }
  return limiters.get(key)!
}

export async function rateLimit(
  req: NextRequest,
  config: RateLimitConfig,
  identifier?: string
): Promise<NextResponse | null> {
  const id = identifier ?? (req.headers.get('x-forwarded-for') ?? 'unknown')
  try {
    const { success, limit, remaining, reset } = await getLimiter(config).limit(id)
    if (!success) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        {
          status: 429,
          headers: {
            'Retry-After': String(Math.ceil((reset - Date.now()) / 1000)),
            'X-RateLimit-Limit': String(limit),
            'X-RateLimit-Remaining': '0',
          },
        }
      )
    }
    return null
  } catch (err) {
    console.error('[rateLimit] Upstash error, failing open:', err)
    return null
  }
}

export const RATE_LIMITS = {
  playerWrite:  { prefix: 'pw', limit: 20, windowSecs: 60 },
  captainWrite: { prefix: 'cw', limit: 30, windowSecs: 60 },
  adminWrite:   { prefix: 'aw', limit: 60, windowSecs: 60 },
  publicRead:   { prefix: 'pr', limit: 100, windowSecs: 60 },
} as const