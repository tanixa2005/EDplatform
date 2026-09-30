import { Request, Response, NextFunction } from 'express';
import { TooManyRequestsError } from '../errors/app.error.js';

interface RateLimitRecord {
  count: number;
  resetAt: number;
}

interface RateLimitOptions {
  windowMs: number;
  maxRequests: number;
  message?: string;
}

export function createRateLimiter(options: RateLimitOptions) {
  const { windowMs, maxRequests, message } = options;
  const store = new Map<string, RateLimitRecord>();

  // Cleanup old entries every 5 minutes to avoid memory leaks
  const cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [key, record] of store.entries()) {
      if (now > record.resetAt) {
        store.delete(key);
      }
    }
  }, 5 * 60 * 1000);

  // Allow process to exit cleanly without keeping the event loop alive for timer
  if (cleanupInterval.unref) {
    cleanupInterval.unref();
  }

  return (req: Request, res: Response, next: NextFunction): void => {
    const key = req.user?.id || req.ip || 'anonymous';
    const now = Date.now();

    const record = store.get(key);

    if (!record || now > record.resetAt) {
      // First request or window expired
      store.set(key, {
        count: 1,
        resetAt: now + windowMs,
      });
      res.setHeader('X-RateLimit-Limit', maxRequests);
      res.setHeader('X-RateLimit-Remaining', maxRequests - 1);
      res.setHeader('X-RateLimit-Reset', Math.ceil((now + windowMs) / 1000));
      return next();
    }

    if (record.count >= maxRequests) {
      const retryAfterSec = Math.max(1, Math.ceil((record.resetAt - now) / 1000));
      res.setHeader('Retry-After', retryAfterSec);
      res.setHeader('X-RateLimit-Limit', maxRequests);
      res.setHeader('X-RateLimit-Remaining', 0);
      res.setHeader('X-RateLimit-Reset', Math.ceil(record.resetAt / 1000));

      throw new TooManyRequestsError(
        message || `Rate limit exceeded. Maximum ${maxRequests} requests per ${windowMs / 1000}s allowed. Please try again in ${retryAfterSec} seconds.`
      );
    }

    record.count += 1;
    res.setHeader('X-RateLimit-Limit', maxRequests);
    res.setHeader('X-RateLimit-Remaining', maxRequests - record.count);
    res.setHeader('X-RateLimit-Reset', Math.ceil(record.resetAt / 1000));
    return next();
  };
}

// Default AI Tutor rate limiter: 20 requests per minute
export const aiRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 20,
  message: 'AI Tutor rate limit exceeded (20 requests/minute). Please wait a moment before sending another query.',
});

// Authentication rate limiter: 15 requests per 15 minutes (brute-force protection)
export const authRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  maxRequests: 15,
  message: 'Too many authentication attempts. Please slow down and try again later.',
});

// Quiz submission rate limiter: 15 requests per minute (anti-spam / integrity protection)
export const quizSubmitRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 15,
  message: 'Too many quiz submissions. Please wait a moment before trying again.',
});

// Dashboard & Analytics rate limiter: 60 requests per minute (DoS protection on aggregations)
export const dashboardRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 60,
  message: 'Dashboard analytics rate limit exceeded. Please wait a moment before refreshing.',
});
