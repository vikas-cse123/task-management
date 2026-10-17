import pino from 'pino';
import { env } from '../config/env';

/**
 * Structured logger with credential redaction.
 *
 * Passwords, session tokens, authorization headers and cookies are removed
 * before they can reach a log sink.
 */
export const logger = pino({
  level: env.LOG_LEVEL,
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'res.headers.set-cookie',
      'password',
      'passwordHash',
      '*.password',
      '*.passwordHash',
      '*.token',
      '*.secret',
      '*.apiKey',
    ],
    remove: true,
  },
});
