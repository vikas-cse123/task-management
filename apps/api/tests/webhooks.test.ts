import { computeHubSignature } from '@interscale/shared';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app';
import type { WhatsAppStatusUpdate } from '../src/routes/webhooks';

const APP_SECRET = 'app-secret-0123456789abcdef';
const VERIFY_TOKEN = 'verify-token-abc';

function buildApp(applyStatus: (update: WhatsAppStatusUpdate) => Promise<boolean>) {
  return createApp({
    whatsappWebhook: { verifyToken: VERIFY_TOKEN, appSecret: APP_SECRET, applyStatus },
  });
}

describe('whatsapp webhook', () => {
  it('echoes the challenge for a valid subscription request', async () => {
    const app = buildApp(vi.fn(async () => true));

    const res = await request(app).get('/api/v1/webhooks/whatsapp').query({
      'hub.mode': 'subscribe',
      'hub.verify_token': VERIFY_TOKEN,
      'hub.challenge': 'challenge-1',
    });

    expect(res.status).toBe(200);
    expect(res.text).toBe('challenge-1');
  });

  it('rejects an invalid verify token', async () => {
    const app = buildApp(vi.fn(async () => true));

    const res = await request(app).get('/api/v1/webhooks/whatsapp').query({
      'hub.mode': 'subscribe',
      'hub.verify_token': 'wrong',
      'hub.challenge': 'challenge-1',
    });

    expect(res.status).toBe(403);
  });

  it('rejects a request with a missing or invalid signature', async () => {
    const app = buildApp(vi.fn(async () => true));
    const payload = JSON.stringify({ entry: [] });

    const noSignature = await request(app)
      .post('/api/v1/webhooks/whatsapp')
      .set('Content-Type', 'application/json')
      .send(payload);
    expect(noSignature.status).toBe(401);

    const badSignature = await request(app)
      .post('/api/v1/webhooks/whatsapp')
      .set('Content-Type', 'application/json')
      .set('X-Hub-Signature-256', 'sha256=deadbeef')
      .send(payload);
    expect(badSignature.status).toBe(401);
  });

  it('applies delivery statuses from a signed payload', async () => {
    const applyStatus = vi.fn(async () => true);
    const app = buildApp(applyStatus);

    const payload = JSON.stringify({
      object: 'whatsapp_business_account',
      entry: [
        {
          id: 'waba-1',
          changes: [
            {
              value: {
                statuses: [
                  {
                    id: 'wamid.1',
                    status: 'delivered',
                    timestamp: '1700000000',
                    recipient_id: '+919812345678',
                  },
                  {
                    id: 'wamid.2',
                    status: 'read',
                    timestamp: '1700000060',
                    recipient_id: '+919812345678',
                  },
                  {
                    id: 'wamid.3',
                    status: 'failed',
                    timestamp: '1700000120',
                    errors: [{ code: 131047 }],
                  },
                  { id: 'wamid.4', status: 'unknown-status', timestamp: '1700000180' },
                ],
              },
            },
          ],
        },
      ],
    });

    const signature = await computeHubSignature(payload, APP_SECRET);
    const res = await request(app)
      .post('/api/v1/webhooks/whatsapp')
      .set('Content-Type', 'application/json')
      .set('X-Hub-Signature-256', signature)
      .send(payload);

    expect(res.status).toBe(200);
    expect(applyStatus).toHaveBeenCalledTimes(3);
    expect(applyStatus).toHaveBeenCalledWith(
      expect.objectContaining({ providerMessageId: 'wamid.1', status: 'delivered' }),
    );
    expect(applyStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        providerMessageId: 'wamid.3',
        status: 'failed',
        errorCode: '131047',
      }),
    );
  });
});
