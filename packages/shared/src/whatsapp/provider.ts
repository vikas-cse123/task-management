import type { WhatsAppTemplateMessage } from './templates';

/**
 * WhatsApp Cloud API provider abstraction (Phase 5).
 *
 * The provider is infrastructure only: it accepts an already-built template
 * message and returns Meta's message id. It never resolves recipients, checks
 * consent, or renders templates — those stay in the notification engine so the
 * rules are testable without a network.
 *
 * Sending is *never* enabled implicitly. `createWhatsAppProvider` returns a
 * disabled provider unless the channel is enabled **and** the phone-number id
 * and access token are configured, so a misconfigured environment fails closed.
 */

export interface WhatsAppProviderConfig {
  readonly enabled: boolean;
  readonly phoneNumberId: string | null;
  readonly accessToken: string | null;
  readonly apiVersion: string;
  readonly graphBaseUrl: string;
  readonly timeoutMs: number;
}

export const DEFAULT_WHATSAPP_GRAPH_BASE_URL = 'https://graph.facebook.com';
export const DEFAULT_WHATSAPP_API_VERSION = 'v21.0';
export const DEFAULT_WHATSAPP_TIMEOUT_MS = 10_000;

export interface WhatsAppSendResult {
  readonly providerMessageId: string;
  readonly acceptedAt: Date;
}

export interface WhatsAppProvider {
  /** Identifies the transport; `mock` is rejected in production. */
  readonly kind: 'cloud' | 'mock' | 'disabled';
  isConfigured(): boolean;
  send(message: WhatsAppTemplateMessage): Promise<WhatsAppSendResult>;
}

/**
 * Provider failure with an explicit retryability decision.
 *
 * The message body never includes the access token or the full phone number.
 */
export class WhatsAppProviderError extends Error {
  readonly retryable: boolean;
  readonly status: number | null;

  constructor(message: string, options: { retryable: boolean; status?: number | null }) {
    super(message);
    this.name = 'WhatsAppProviderError';
    this.retryable = options.retryable;
    this.status = options.status ?? null;
  }
}

interface ErrorEnvelope {
  readonly error?: { readonly message?: unknown; readonly code?: unknown };
}

interface SuccessEnvelope {
  readonly messages?: readonly { readonly id?: unknown }[];
}

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * Live Meta Cloud API provider.
 *
 * A non-2xx response is mapped to a `WhatsAppProviderError` whose message is
 * Meta's own error text (never the request or token). 429 / 408 / 5xx are
 * retryable; other 4xx are permanent (a bad template or number must not loop).
 */
export function createCloudWhatsAppProvider(config: WhatsAppProviderConfig): WhatsAppProvider {
  return {
    kind: 'cloud',
    isConfigured: () =>
      config.enabled && Boolean(config.phoneNumberId) && Boolean(config.accessToken),
    async send(message) {
      if (!config.phoneNumberId || !config.accessToken) {
        throw new WhatsAppProviderError('WhatsApp provider is not configured', {
          retryable: false,
        });
      }

      const url = `${config.graphBaseUrl}/${config.apiVersion}/${config.phoneNumberId}/messages`;
      let response: Response;

      try {
        response = await fetch(url, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${config.accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(message),
          signal: AbortSignal.timeout(config.timeoutMs),
        });
      } catch (error) {
        const reason = error instanceof Error ? error.name : 'network error';
        throw new WhatsAppProviderError(`WhatsApp request failed (${reason})`, {
          retryable: true,
        });
      }

      const text = await response.text().catch(() => '');

      if (!response.ok) {
        let detail = '';

        try {
          const parsed: unknown = JSON.parse(text);
          if (isRecord(parsed)) {
            const envelope = parsed as ErrorEnvelope;
            detail = typeof envelope.error?.message === 'string' ? envelope.error.message : '';
          }
        } catch {
          detail = '';
        }

        throw new WhatsAppProviderError(
          `WhatsApp API rejected the message (HTTP ${response.status})${detail ? `: ${detail}` : ''}`,
          { retryable: isRetryableStatus(response.status), status: response.status },
        );
      }

      let parsed: unknown;

      try {
        parsed = JSON.parse(text);
      } catch {
        throw new WhatsAppProviderError('WhatsApp API returned an unreadable response', {
          retryable: true,
          status: response.status,
        });
      }

      const id = isRecord(parsed) ? (parsed as SuccessEnvelope).messages?.[0]?.id : undefined;

      if (typeof id !== 'string' || id.length === 0) {
        throw new WhatsAppProviderError('WhatsApp API accepted no message id', {
          retryable: true,
          status: response.status,
        });
      }

      return { providerMessageId: id, acceptedAt: new Date() };
    },
  };
}

/**
 * Deterministic in-memory provider for tests and local dry runs.
 *
 * It never contacts the network. Ids are derived from the recipient and an
 * internal counter so assertions are stable across runs.
 */
export function createMockWhatsAppProvider(): WhatsAppProvider {
  let counter = 0;

  return {
    kind: 'mock',
    isConfigured: () => true,
    async send(message) {
      counter += 1;
      const to = typeof message.to === 'string' ? message.to : '';
      return {
        providerMessageId: `wamid.mock.${counter}.${to.replace(/\D/g, '').slice(-4)}`,
        acceptedAt: new Date(),
      };
    },
  };
}

/** A provider that can never send; used when the channel is disabled. */
export function createDisabledWhatsAppProvider(): WhatsAppProvider {
  return {
    kind: 'disabled',
    isConfigured: () => false,
    async send() {
      throw new WhatsAppProviderError('WhatsApp notifications are disabled', { retryable: false });
    },
  };
}

/**
 * Select a provider from configuration, failing closed.
 *
 * `providerMode` of `mock` is only honored outside production; production always
 * uses the live Cloud API once configured.
 */
export function createWhatsAppProvider(
  config: WhatsAppProviderConfig & { readonly providerMode?: 'cloud' | 'mock' },
  environment: string,
): WhatsAppProvider {
  if (config.providerMode === 'mock' && environment !== 'production') {
    return createMockWhatsAppProvider();
  }

  if (!config.enabled || !config.phoneNumberId || !config.accessToken) {
    return createDisabledWhatsAppProvider();
  }

  return createCloudWhatsAppProvider(config);
}
