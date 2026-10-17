import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  MONGODB_URI: z.string().min(1),
  AGENDA_DB_COLLECTION: z.string().min(1).default('agendaJobs'),
  WORKER_PROCESS_EVERY: z.string().min(1).default('30 seconds'),
  /** Stable identity used for outbox claim leases and logs. */
  WORKER_ID: z.string().min(1).optional(),
  /** Dispatch sweep cadence. */
  WORKER_NOTIFICATION_INTERVAL: z.string().min(1).default('1 minute'),
  /** Deadline reminder scan cadence. */
  WORKER_DEADLINE_INTERVAL: z.string().min(1).default('5 minutes'),
  /** Recurring campaign-review cadence. */
  WORKER_CAMPAIGN_REVIEW_INTERVAL: z.string().min(1).default('1 hour'),
  /** Emergency kill-switch for the WhatsApp channel (in-app is unaffected). */
  WHATSAPP_NOTIFICATIONS_ENABLED: z
    .enum(['true', 'false'])
    .default('true')
    .transform((value) => value === 'true'),
  WHATSAPP_PROVIDER: z.enum(['cloud', 'mock']).default('cloud'),
  WHATSAPP_PHONE_NUMBER_ID: z.string().min(1).optional(),
  WHATSAPP_ACCESS_TOKEN: z.string().min(1).optional(),
  WHATSAPP_API_VERSION: z.string().min(1).default('v21.0'),
  WHATSAPP_GRAPH_BASE_URL: z.string().min(1).default('https://graph.facebook.com'),
  WHATSAPP_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),
});

export type WorkerEnv = z.infer<typeof envSchema>;

export function loadWorkerEnv(source: NodeJS.ProcessEnv = process.env): WorkerEnv {
  const parsed = envSchema.safeParse(source);

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid worker environment configuration:\n${issues}`);
  }

  return parsed.data;
}

export const workerEnv = loadWorkerEnv();
