import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildTemplateBodyParameters,
  buildTemplateMessage,
  computeHubSignature,
  constantTimeEqual,
  createCloudWhatsAppProvider,
  createDisabledWhatsAppProvider,
  createMockWhatsAppProvider,
  createWhatsAppProvider,
  getTemplateDefinition,
  NOTIFICATION_EVENT_TEMPLATE,
  NOTIFICATION_EVENT_TYPES,
  redactPhoneNumber,
  renderFallbackText,
  validateTemplateRegistry,
  verifyHubSignature,
  verifyWebhookChallenge,
  WHATSAPP_TEMPLATES,
  WHATSAPP_TEMPLATE_KEYS,
} from './index';

const ASSIGN_VALUES = {
  employee_name: 'Asha',
  task_title: 'Design the ad',
  project_name: 'Acme Launch',
  due_date: '2026-01-05 18:00',
  url: 'https://app.interscale.local/tasks/abc',
};

describe('whatsapp template registry', () => {
  it('is internally consistent', () => {
    expect(validateTemplateRegistry()).toEqual([]);
  });

  it('uses valid Meta template names', () => {
    for (const key of WHATSAPP_TEMPLATE_KEYS) {
      expect(WHATSAPP_TEMPLATES[key].name).toMatch(/^[a-z0-9_]{1,512}$/);
    }
  });

  it('maps every notification event to a template', () => {
    for (const eventType of NOTIFICATION_EVENT_TYPES) {
      const key = NOTIFICATION_EVENT_TEMPLATE[eventType];
      expect(WHATSAPP_TEMPLATE_KEYS).toContain(key);
    }
  });

  it('builds ordered body parameters and rejects missing values', () => {
    const definition = getTemplateDefinition('task_assigned');
    const parameters = buildTemplateBodyParameters(definition, ASSIGN_VALUES);

    expect(parameters).toHaveLength(definition.parameters.length);
    expect(parameters[0]).toEqual({ type: 'text', text: 'Asha' });

    expect(() =>
      buildTemplateBodyParameters(definition, { ...ASSIGN_VALUES, task_title: '  ' }),
    ).toThrow(RangeError);
  });

  it('collapses whitespace and newlines in parameters', () => {
    const definition = getTemplateDefinition('task_assigned');
    const parameters = buildTemplateBodyParameters(definition, {
      ...ASSIGN_VALUES,
      task_title: 'Line one\nLine two',
    });

    expect(parameters[1]?.text).toBe('Line one Line two');
  });

  it('builds a Cloud API template message', () => {
    const message = buildTemplateMessage(
      '+919876543210',
      getTemplateDefinition('task_assigned'),
      ASSIGN_VALUES,
    );

    expect(message.messaging_product).toBe('whatsapp');
    expect(message.to).toBe('+919876543210');
    expect(message.template.name).toBe('interscale_task_assigned');
    expect(message.template.language.code).toBe('en');
    expect(message.template.components[0]?.parameters).toHaveLength(5);
  });

  it('renders the in-app fallback', () => {
    const text = renderFallbackText(getTemplateDefinition('task_assigned'), ASSIGN_VALUES);

    expect(text).toContain('Asha');
    expect(text).toContain('Design the ad');
    expect(text).not.toContain('{');
  });
});

describe('webhook verification', () => {
  it('computes a deterministic sha256 signature', async () => {
    const signature = await computeHubSignature('{"a":1}', 'topsecret');

    expect(signature).toMatch(/^sha256=[0-9a-f]{64}$/);
    await expect(computeHubSignature('{"a":1}', 'topsecret')).resolves.toBe(signature);
  });

  it('accepts only a matching signature over the raw body', async () => {
    const rawBody = '{"object":"whatsapp_business_account"}';
    const header = await computeHubSignature(rawBody, 'topsecret');

    await expect(verifyHubSignature({ rawBody, header, appSecret: 'topsecret' })).resolves.toBe(
      true,
    );
    await expect(
      verifyHubSignature({ rawBody: 'tampered', header, appSecret: 'topsecret' }),
    ).resolves.toBe(false);
    await expect(verifyHubSignature({ rawBody, header, appSecret: 'wrong' })).resolves.toBe(false);
    await expect(
      verifyHubSignature({ rawBody, header: undefined, appSecret: 'topsecret' }),
    ).resolves.toBe(false);
    await expect(verifyHubSignature({ rawBody, header, appSecret: null })).resolves.toBe(false);
  });

  it('verifies the subscription challenge', () => {
    expect(verifyWebhookChallenge({ mode: 'subscribe', token: 'tok', verifyToken: 'tok' })).toBe(
      true,
    );
    expect(verifyWebhookChallenge({ mode: 'subscribe', token: 'bad', verifyToken: 'tok' })).toBe(
      false,
    );
    expect(verifyWebhookChallenge({ mode: 'unsubscribe', token: 'tok', verifyToken: 'tok' })).toBe(
      false,
    );
    expect(
      verifyWebhookChallenge({ mode: 'subscribe', token: undefined, verifyToken: 'tok' }),
    ).toBe(false);
  });

  it('compares in constant time', () => {
    expect(constantTimeEqual('abc', 'abc')).toBe(true);
    expect(constantTimeEqual('abc', 'abd')).toBe(false);
    expect(constantTimeEqual('abc', 'abcd')).toBe(false);
  });

  it('redacts phone numbers for logs', () => {
    expect(redactPhoneNumber('+919876543210')).toBe('****3210');
    expect(redactPhoneNumber('12')).toBe('****');
  });
});

describe('whatsapp provider', () => {
  const MESSAGE = buildTemplateMessage(
    '+919876543210',
    getTemplateDefinition('task_assigned'),
    ASSIGN_VALUES,
  );

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sends through the mock provider without a network', async () => {
    const provider = createMockWhatsAppProvider();
    const result = await provider.send(MESSAGE);

    expect(provider.kind).toBe('mock');
    expect(result.providerMessageId).toContain('wamid.mock.');
  });

  it('fails closed when disabled', async () => {
    const disabled = createDisabledWhatsAppProvider();
    expect(disabled.isConfigured()).toBe(false);
    await expect(disabled.send(MESSAGE)).rejects.toMatchObject({ retryable: false });
  });

  it('only uses the mock provider outside production', () => {
    const config = {
      enabled: false,
      phoneNumberId: null,
      accessToken: null,
      apiVersion: 'v21.0',
      graphBaseUrl: 'https://graph.facebook.com',
      timeoutMs: 1000,
    };

    expect(createWhatsAppProvider({ ...config, providerMode: 'mock' }, 'test').kind).toBe('mock');
    expect(createWhatsAppProvider({ ...config, providerMode: 'mock' }, 'production').kind).toBe(
      'disabled',
    );
    expect(
      createWhatsAppProvider({ ...config, enabled: true, phoneNumberId: '1' }, 'production').kind,
    ).toBe('disabled');
  });

  it('parses a successful Cloud API response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ messages: [{ id: 'wamid.live.1' }] }), { status: 200 }),
      ),
    );

    const provider = createCloudWhatsAppProvider({
      enabled: true,
      phoneNumberId: '123',
      accessToken: 'tok',
      apiVersion: 'v21.0',
      graphBaseUrl: 'https://graph.facebook.com',
      timeoutMs: 1000,
    });

    await expect(provider.send(MESSAGE)).resolves.toMatchObject({
      providerMessageId: 'wamid.live.1',
    });
  });

  it('marks 5xx and 429 retryable and other 4xx permanent', async () => {
    const provider = createCloudWhatsAppProvider({
      enabled: true,
      phoneNumberId: '123',
      accessToken: 'tok',
      apiVersion: 'v21.0',
      graphBaseUrl: 'https://graph.facebook.com',
      timeoutMs: 1000,
    });

    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () => new Response(JSON.stringify({ error: { message: 'boom' } }), { status: 500 }),
      ),
    );
    await expect(provider.send(MESSAGE)).rejects.toMatchObject({ retryable: true, status: 500 });

    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () => new Response(JSON.stringify({ error: { message: 'bad' } }), { status: 400 }),
      ),
    );
    await expect(provider.send(MESSAGE)).rejects.toMatchObject({ retryable: false, status: 400 });
  });
});
