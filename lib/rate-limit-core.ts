/**
 * Fixed-window, in-memory limiter. Counters live per server instance, so on Vercel this caps casual flooding
 * rather than guaranteeing a global limit; swap `hit` for Upstash/Redis if a hard limit is ever needed.
 */
type Bucket = { count: number; resetAt: number };

type LimiterState = typeof globalThis & { papiflixRateLimits?: Map<string, Bucket> };
const state = globalThis as LimiterState;
const buckets = (state.papiflixRateLimits ??= new Map<string, Bucket>());
const MAX_KEYS = 10_000;

function sweep(now: number) {
  if (buckets.size < MAX_KEYS) return;
  for (const [key, bucket] of buckets) if (bucket.resetAt <= now) buckets.delete(key);
  if (buckets.size >= MAX_KEYS) buckets.clear();
}

export interface RateLimitResult {
  limited: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export function hit(key: string, limit: number, windowMs: number, now = Date.now()): RateLimitResult {
  sweep(now);
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { limited: false, remaining: limit - 1, retryAfterSeconds: 0 };
  }
  bucket.count += 1;
  const retryAfterSeconds = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
  return { limited: bucket.count > limit, remaining: Math.max(0, limit - bucket.count), retryAfterSeconds };
}

