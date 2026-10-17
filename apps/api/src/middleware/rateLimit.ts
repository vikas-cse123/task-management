import { rateLimit } from 'express-rate-limit';
import { env } from '../config/env';

/**
 * General API rate limiting for `/api/v1/*` (Better Auth protects its own
 * routes separately).
 *
 * - Generous ceiling (1000 requests / 15 minutes per IP) so trusted local
 *   development is never disrupted; abuse and runaway clients still capped.
 * - The limiter auto-detects the Express `trust proxy` setting (single Nginx
 *   hop), so `req.ip` is correct behind the reverse proxy.
 * - Skipped entirely when `NODE_ENV=test` so automated tests stay
 *   deterministic.
 */
export const apiRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 1000,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skip: () => env.NODE_ENV === 'test',
  handler: (req, res) => {
    res.status(429).json({
      error: {
        code: 'RATE_LIMITED',
        message: 'Too many requests. Please slow down and try again.',
        requestId: req.requestId,
      },
    });
  },
});
