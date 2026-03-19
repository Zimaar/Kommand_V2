import type { Redis } from "ioredis";

interface RateLimitOptions {
  window: number; // seconds
  max: number;
}

export async function checkRateLimit(
  redis: Redis,
  key: string,
  options: RateLimitOptions
): Promise<{ allowed: boolean; remaining: number; resetAt: number }> {
  const now = Math.floor(Date.now() / 1000);
  const windowStart = now - options.window;
  const redisKey = `rate_limit:${key}`;

  const pipeline = redis.pipeline();
  pipeline.zremrangebyscore(redisKey, "-inf", windowStart);
  pipeline.zadd(redisKey, now, `${now}-${Math.random()}`);
  pipeline.zcard(redisKey);
  pipeline.expire(redisKey, options.window);

  const results = await pipeline.exec();
  const count = (results?.[2]?.[1] as number) ?? 0;
  const allowed = count <= options.max;
  const remaining = Math.max(0, options.max - count);
  const resetAt = now + options.window;

  return { allowed, remaining, resetAt };
}

// Per-tenant agent run rate limits
export const AGENT_RUN_LIMITS: Record<string, RateLimitOptions> = {
  trial: { window: 3600, max: 10 },
  starter: { window: 3600, max: 50 },
  growth: { window: 3600, max: 200 },
  pro: { window: 3600, max: 1000 },
};
