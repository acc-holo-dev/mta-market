// Rate limiting middleware using Redis
import { Request, Response, NextFunction } from "express";
import { redis } from "../lib/redis";

interface RateLimitOptions {
  windowMs: number; // время окна в миллисекундах
  max: number; // максимум запросов в окне
  keyPrefix?: string;
}

export function rateLimit(options: RateLimitOptions) {
  const { windowMs, max, keyPrefix = "rl" } = options;

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const identifier = req.ip || req.socket.remoteAddress || "unknown";
    const key = `${keyPrefix}:${identifier}`;

    try {
      const current = await redis.incr(key);

      if (current === 1) {
        await redis.pexpire(key, windowMs);
      }

      res.setHeader("X-RateLimit-Limit", max);
      res.setHeader("X-RateLimit-Remaining", Math.max(0, max - current));

      if (current > max) {
        res.status(429).json({
          error: "Too many requests",
          retryAfter: Math.ceil(windowMs / 1000),
        });
        return;
      }

      next();
    } catch (error) {
      // Если Redis недоступен, пропускаем rate limiting
      console.error("Rate limit error:", error);
      next();
    }
  };
}

// Предустановки
// Thresholds are env-configurable so staging/tests can tune them without
// code changes (PLAN Q-002 will introduce per-dimension limits).
export const strictRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 минута
  max: parseInt(process.env.STRICT_RATE_LIMIT_MAX || "10", 10),
  keyPrefix: "rl:strict",
});

export const standardRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 минута
  max: parseInt(process.env.STANDARD_RATE_LIMIT_MAX || "60", 10),
  keyPrefix: "rl:standard",
});

export const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 минут
  max: parseInt(process.env.AUTH_RATE_LIMIT_MAX || "5", 10),
  keyPrefix: "rl:auth",
});
