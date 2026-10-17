/**
 * WhatsApp webhook verification (Phase 5).
 *
 * Two independent checks:
 *  - `verifyWebhookChallenge` — the GET subscription handshake, comparing the
 *    hub.verify_token to the configured token in constant time.
 *  - `verifyHubSignature` — the `X-Hub-Signature-256` HMAC over the **raw**
 *    request body, compared to the computed value in constant time. The raw
 *    body must be verified before it is parsed, so a forged payload can never
 *    be trusted.
 *
 * Web Crypto is used so this module stays free of Node-only builtins and can be
 * unit-tested anywhere.
 */

const textEncoder = new TextEncoder();

/**
 * Copy the body into a fresh `ArrayBuffer` so it is accepted as a `BufferSource`
 * regardless of the backing buffer of the input typed array.
 */
function toBytes(value: string | Uint8Array): ArrayBuffer {
  const bytes = typeof value === 'string' ? textEncoder.encode(value) : value;
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);

  return copy.buffer;
}

function toHex(bytes: Uint8Array): string {
  let hex = '';

  for (const byte of bytes) {
    hex += byte.toString(16).padStart(2, '0');
  }

  return hex;
}

/**
 * Compare two strings in constant time with respect to their contents.
 *
 * The length difference is folded into the accumulator so unequal-length
 * inputs still run a bounded loop over both.
 */
export function constantTimeEqual(a: string, b: string): boolean {
  const aLength = a.length;
  const bLength = b.length;
  const maxLength = Math.max(aLength, bLength);
  let mismatch = aLength ^ bLength;

  for (let index = 0; index < maxLength; index += 1) {
    const aCode = index < aLength ? a.charCodeAt(index) : 0;
    const bCode = index < bLength ? b.charCodeAt(index) : 0;
    mismatch |= aCode ^ bCode;
  }

  return mismatch === 0;
}

/** Compute `sha256=<hex hmac>` for a raw webhook body. */
export async function computeHubSignature(
  rawBody: string | Uint8Array,
  appSecret: string,
): Promise<string> {
  const key = await globalThis.crypto.subtle.importKey(
    'raw',
    textEncoder.encode(appSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  const signature = await globalThis.crypto.subtle.sign('HMAC', key, toBytes(rawBody));

  return `sha256=${toHex(new Uint8Array(signature))}`;
}

/**
 * Verify the `X-Hub-Signature-256` header against the raw body.
 *
 * Returns false for any missing input, never throwing, so callers can reject
 * uniformly with 401.
 */
export async function verifyHubSignature(input: {
  rawBody: string | Uint8Array;
  header: string | undefined | null;
  appSecret: string | null;
}): Promise<boolean> {
  if (!input.header || !input.appSecret) {
    return false;
  }

  const expected = await computeHubSignature(input.rawBody, input.appSecret);

  return constantTimeEqual(expected, input.header);
}

/** Verify the GET subscription challenge (hub.mode / hub.verify_token). */
export function verifyWebhookChallenge(input: {
  mode: string | undefined;
  token: string | undefined;
  verifyToken: string | null;
}): boolean {
  if (!input.verifyToken || !input.token) {
    return false;
  }

  return input.mode === 'subscribe' && constantTimeEqual(input.token, input.verifyToken);
}

/**
 * Redact a phone number for logs, keeping only the last four digits.
 *
 * Phone numbers are personal data; they must never appear in full in logs.
 */
export function redactPhoneNumber(value: string): string {
  const digits = value.replace(/\D/g, '');

  if (digits.length <= 4) {
    return '****';
  }

  return `****${digits.slice(-4)}`;
}
