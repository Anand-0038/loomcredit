export interface RateLimitOptions {
  maxRequests: number;
  windowMs: number;
}

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

interface Bucket {
  count: number;
  windowStartedAt: number;
}

const buckets = new Map<string, Bucket>();

export function consumeRateLimit(
  key: string,
  options: RateLimitOptions,
  now = Date.now(),
): RateLimitResult {
  if (
    !key ||
    !Number.isSafeInteger(options.maxRequests) ||
    options.maxRequests < 1 ||
    !Number.isSafeInteger(options.windowMs) ||
    options.windowMs < 1
  ) {
    throw new Error("Rate-limit options are invalid.");
  }

  const current = buckets.get(key);
  if (!current || now - current.windowStartedAt >= options.windowMs) {
    buckets.set(key, { count: 1, windowStartedAt: now });
    pruneExpiredBuckets(now, options.windowMs);
    return { allowed: true, retryAfterSeconds: 0 };
  }

  if (current.count >= options.maxRequests) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(
        1,
        Math.ceil((current.windowStartedAt + options.windowMs - now) / 1_000),
      ),
    };
  }

  current.count += 1;
  return { allowed: true, retryAfterSeconds: 0 };
}

function pruneExpiredBuckets(now: number, windowMs: number): void {
  if (buckets.size < 10_000) return;
  for (const [key, bucket] of buckets) {
    if (now - bucket.windowStartedAt >= windowMs) buckets.delete(key);
  }
}

export function clearRateLimitsForTests(): void {
  buckets.clear();
}
