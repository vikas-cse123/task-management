import type { ApiErrorBody } from '@interscale/shared';

/**
 * Error thrown by {@link apiRequest} / {@link authRequest}.
 *
 * `code` carries the machine-readable application code (`UNAUTHENTICATED`, …)
 * or the Better Auth code for `/api/auth/*` responses. The message is always
 * safe to display to the user.
 */
export class ApiClientError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiClientError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();

  if (!text) {
    return undefined;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

function toError(response: Response, payload: unknown): ApiClientError {
  const candidate = payload as
    { error?: ApiErrorBody; message?: string; code?: string } | undefined;

  if (candidate?.error) {
    const body = candidate.error;
    return new ApiClientError(response.status, body.code, body.message, body.details);
  }

  return new ApiClientError(
    response.status,
    candidate?.code ?? 'INTERNAL_ERROR',
    candidate?.message ?? `Request failed with status ${response.status}`,
  );
}

/** Extract a display-safe message from an unknown thrown value. */
export function errorMessage(
  error: unknown,
  fallback = 'Something went wrong. Please try again.',
): string {
  if (error instanceof ApiClientError) {
    return error.message;
  }

  return fallback;
}

async function send(
  path: string,
  init: RequestInit,
): Promise<{ response: Response; payload: unknown }> {
  const method = (init.method ?? 'GET').toUpperCase();
  const headers = new Headers(init.headers);

  if (init.body !== undefined && !headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }

  const response = await fetch(path, { credentials: 'include', ...init, method, headers });
  const payload = response.status === 204 ? undefined : await readJson(response);

  return { response, payload };
}

/** Call a versioned REST endpoint (`/api/v1/...`) and unwrap the `data` field. */
export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { response, payload } = await send(path, init);

  if (!response.ok) {
    throw toError(response, payload);
  }

  if (payload && typeof payload === 'object' && 'data' in payload) {
    return (payload as { data: T }).data;
  }

  return payload as T;
}

/** Call a Better Auth endpoint (`/api/auth/...`) using its own body shape. */
export async function authRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { response, payload } = await send(path, init);

  if (!response.ok) {
    throw toError(response, payload);
  }

  return payload as T;
}
