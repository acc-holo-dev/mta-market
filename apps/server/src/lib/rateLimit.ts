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
export const strictRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 минута
  max: 10,
  keyPrefix: "rl:strict",
});

export const standardRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 минута
  max: 60,
  keyPrefix: "rl:standard",
});

export const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 минут
  max: 5,
  keyPrefix: "rl:auth",
});
