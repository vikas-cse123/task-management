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
  /** Emergency kill-switch for the WhatsApp channel (in-app is unaffected). */
  WHATSAPP_NOTIFICATIONS_ENABLED: z
    .enum(['true', 'false'])
    .default('true')
    .transform((value) => value === 'true'),
  /** WhatsApp webhook subscription token (GET verification). */
  WHATSAPP_VERIFY_TOKEN: z.string().min(1).optional(),
  /** WhatsApp app secret used to verify the X-Hub-Signature-256 header. */
  WHATSAPP_APP_SECRET: z.string().min(1).optional(),
  WHATSAPP_PROVIDER: z.enum(['cloud', 'mock']).default('cloud'),
  WHATSAPP_PHONE_NUMBER_ID: z.string().min(1).optional(),
  WHATSAPP_ACCESS_TOKEN: z.string().min(1).optional(),
  WHATSAPP_API_VERSION: z.string().min(1).default('v21.0'),
  WHATSAPP_GRAPH_BASE_URL: z.string().min(1).default('https://graph.facebook.com'),
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
