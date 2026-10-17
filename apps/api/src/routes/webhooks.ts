import { applyDeliveryConfirmation } from '@interscale/db';
import { redactPhoneNumber, verifyHubSignature, verifyWebhookChallenge } from '@interscale/shared';
import { Router, type Request } from 'express';
import { logger } from '../lib/logger';

/**
 * Meta WhatsApp Cloud API webhook (Phase 5, Step 26).
 *
 * IMPORTANT: this router must be mounted with `express.raw()` **before** the
 * global `express.json()` middleware, because the `X-Hub-Signature-256`
 * header is computed over the exact raw bytes Meta sent. Re-serializing parsed
 * JSON would break verification.
 *
 * - `GET`  verifies the subscription challenge (`hub.mode`/`hub.verify_token`).
 * - `POST` verifies the signature, then applies delivery status updates.
 *
 * Delivery confirmations only ever *advance* an outbox record's status (see
 * `applyDeliveryConfirmation`), so replaying or reordering webhooks is safe.
 * Unknown message ids are ignored with a 200 so Meta does not retry forever.
 */

export type WhatsAppDeliveryStatus = 'sent' | 'delivered' | 'read' | 'failed';

export interface WhatsAppStatusUpdate {
  providerMessageId: string;
  status: WhatsAppDeliveryStatus;
  at: Date;
  errorCode: string | null;
}

export interface WhatsAppWebhookConfig {
  verifyToken: string | null;
  appSecret: string | null;
  /** Override the delivery-status sink (tests inject a spy). */
  applyStatus?: (update: WhatsAppStatusUpdate) => Promise<boolean>;
}

const STATUS_MAP: Record<string, WhatsAppDeliveryStatus> = {
  sent: 'sent',
  delivered: 'delivered',
  read: 'read',
  failed: 'failed',
};

function firstQueryValue(value: unknown): string | undefined {
  if (typeof value === 'string') {
    return value;
  }

  if (Array.isArray(value) && typeof value[0] === 'string') {
    return value[0];
  }

  return undefined;
}

function rawBodyBuffer(req: Request): Buffer {
  if (Buffer.isBuffer(req.body)) {
    return req.body;
  }

  if (typeof req.body === 'string') {
    return Buffer.from(req.body, 'utf8');
  }

  return Buffer.from(JSON.stringify(req.body ?? {}), 'utf8');
}

interface ExtractedStatus extends WhatsAppStatusUpdate {
  recipientId: string | null;
}

/** Pull delivery statuses out of the Cloud API webhook envelope. */
export function extractStatusUpdates(payload: unknown): ExtractedStatus[] {
  const updates: ExtractedStatus[] = [];

  if (!payload || typeof payload !== 'object') {
    return updates;
  }

  const entries = (payload as { entry?: unknown }).entry;

  if (!Array.isArray(entries)) {
    return updates;
  }

  for (const entry of entries) {
    const changes = (entry as { changes?: unknown })?.changes;

    if (!Array.isArray(changes)) {
      continue;
    }

    for (const change of changes) {
      const value = (change as { value?: unknown })?.value as { statuses?: unknown } | undefined;
      const statuses = value?.statuses;

      if (!Array.isArray(statuses)) {
        continue;
      }

      for (const status of statuses) {
        const raw = status as {
          id?: unknown;
          status?: unknown;
          timestamp?: unknown;
          recipient_id?: unknown;
          errors?: unknown;
        };

        const mapped = typeof raw.status === 'string' ? STATUS_MAP[raw.status] : undefined;

        if (!mapped || typeof raw.id !== 'string' || raw.id.length === 0) {
          continue;
        }

        const timestampSeconds = Number(raw.timestamp);
        const at = Number.isFinite(timestampSeconds)
          ? new Date(timestampSeconds * 1000)
          : new Date();

        const errors = Array.isArray(raw.errors) ? raw.errors : [];
        const firstError = errors[0] as { code?: unknown } | undefined;
        const errorCode =
          firstError && (typeof firstError.code === 'string' || typeof firstError.code === 'number')
            ? String(firstError.code)
            : null;

        updates.push({
          providerMessageId: raw.id,
          status: mapped,
          at,
          errorCode,
          recipientId: typeof raw.recipient_id === 'string' ? raw.recipient_id : null,
        });
      }
    }
  }

  return updates;
}

export function createWhatsAppWebhookRouter(config: WhatsAppWebhookConfig): Router {
  const router = Router();
  const applyStatus =
    config.applyStatus ??
    ((update: WhatsAppStatusUpdate) =>
      applyDeliveryConfirmation({
        providerMessageId: update.providerMessageId,
        status: update.status,
        at: update.at,
        errorCode: update.errorCode,
      }));

  router.get('/whatsapp', (req, res) => {
    const mode = firstQueryValue(req.query['hub.mode']);
    const token = firstQueryValue(req.query['hub.verify_token']);
    const challenge = firstQueryValue(req.query['hub.challenge']);

    if (
      challenge !== undefined &&
      verifyWebhookChallenge({ mode, token, verifyToken: config.verifyToken })
    ) {
      res.status(200).type('text/plain').send(challenge);
      return;
    }

    logger.warn(
      { requestId: (req as { requestId?: string }).requestId },
      'WhatsApp webhook verification rejected',
    );
    res.sendStatus(403);
  });

  router.post('/whatsapp', (req, res) => {
    const requestId = (req as { requestId?: string }).requestId;

    void (async () => {
      const rawBody = rawBodyBuffer(req);

      const signatureValid = await verifyHubSignature({
        rawBody,
        header: req.get('x-hub-signature-256'),
        appSecret: config.appSecret,
      });

      if (!signatureValid) {
        logger.warn({ requestId }, 'WhatsApp webhook signature rejected');
        res.sendStatus(401);
        return;
      }

      let payload: unknown;

      try {
        payload = JSON.parse(rawBody.toString('utf8'));
      } catch {
        logger.warn({ requestId }, 'WhatsApp webhook body was not valid JSON');
        res.sendStatus(400);
        return;
      }

      const updates = extractStatusUpdates(payload);

      for (const update of updates) {
        try {
          const applied = await applyStatus(update);

          logger.info(
            {
              requestId,
              providerMessageId: update.providerMessageId,
              status: update.status,
              applied,
              recipient: update.recipientId ? redactPhoneNumber(update.recipientId) : null,
            },
            'WhatsApp delivery status processed',
          );
        } catch (error) {
          logger.error(
            { requestId, providerMessageId: update.providerMessageId, err: error },
            'WhatsApp delivery status failed to apply',
          );
        }
      }

      res.sendStatus(200);
    })();
  });

  return router;
}
