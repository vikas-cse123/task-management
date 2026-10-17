import { hostname } from 'node:os';
import { createWhatsAppProvider, type WhatsAppProvider } from '@interscale/shared';
import { workerEnv } from './env';

/**
 * Build the WhatsApp provider for the worker, failing closed.
 *
 * The live Cloud API is used only when the channel is enabled and credentials
 * are present. `mock` is honored outside production for local dry runs; in
 * production it always falls back to the live provider.
 */
export function buildWhatsAppProvider(): WhatsAppProvider {
  return createWhatsAppProvider(
    {
      enabled: workerEnv.WHATSAPP_NOTIFICATIONS_ENABLED,
      phoneNumberId: workerEnv.WHATSAPP_PHONE_NUMBER_ID ?? null,
      accessToken: workerEnv.WHATSAPP_ACCESS_TOKEN ?? null,
      apiVersion: workerEnv.WHATSAPP_API_VERSION,
      graphBaseUrl: workerEnv.WHATSAPP_GRAPH_BASE_URL,
      timeoutMs: workerEnv.WHATSAPP_TIMEOUT_MS,
      providerMode: workerEnv.WHATSAPP_PROVIDER,
    },
    workerEnv.NODE_ENV,
  );
}

/** Stable worker identity for claim leases and logs. */
export function workerIdentity(): string {
  return workerEnv.WORKER_ID ?? `${hostname()}-${process.pid}`;
}
