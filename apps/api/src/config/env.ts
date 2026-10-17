import 'dotenv/config';
import { z } from 'zod';

/**
 * Environment validation. Every process reads configuration through this
 * schema so misconfiguration fails fast and loudly at startup.
 *
 * Secrets are optional here because they are only required by the features
 * that use them (for example Better Auth in a later step). No secret is ever
 * logged.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().positive().default(4000),
  API_HOST: z.string().min(1).default('127.0.0.1'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  MONGODB_URI: z.string().min(1).optional(),
  BETTER_AUTH_SECRET: z.string().min(16).optional(),
  BETTER_AUTH_URL: z.string().min(1).optional(),
  WEB_ORIGIN: z.string().min(1).optional(),
  INITIAL_ADMIN_EMAIL: z.string().min(1).optional(),
  INITIAL_ADMIN_NAME: z.string().min(1).optional(),
  INITIAL_ADMIN_PASSWORD: z.string().min(1).optional(),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source);

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }

  return parsed.data;
}

export const env = loadEnv();
