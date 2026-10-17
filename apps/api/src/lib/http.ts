import { API_ERROR_STATUS, type ApiErrorCode } from '@interscale/shared';

/**
 * Typed application error used for all expected (non-bug) failures so the
 * error middleware can produce a consistent response envelope
 * `{ error: { code, message, details?, requestId } }` (docs/05-api.md).
 */
export class ApiError extends Error {
  readonly statusCode: number;
  readonly code: ApiErrorCode;
  readonly details?: unknown;

  constructor(code: ApiErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.statusCode = API_ERROR_STATUS[code];
    this.details = details;
  }
}

export function notFoundError(message = 'Resource not found'): ApiError {
  return new ApiError('NOT_FOUND', message);
}

export function forbiddenError(message = 'You do not have access to this resource'): ApiError {
  return new ApiError('FORBIDDEN', message);
}

export function unauthorizedError(message = 'Authentication required'): ApiError {
  return new ApiError('UNAUTHENTICATED', message);
}

export function validationError(message: string, details?: unknown): ApiError {
  return new ApiError('VALIDATION_ERROR', message, details);
}

export function conflictError(message: string, details?: unknown): ApiError {
  return new ApiError('CONFLICT', message, details);
}

export function concurrentModificationError(
  message = 'The record was modified by someone else. Reload and try again.',
): ApiError {
  return new ApiError('CONCURRENT_MODIFICATION', message);
}

/** Extract a required path parameter as a non-empty string. */
export function pathParam(value: unknown, label = 'identifier'): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw validationError(`A valid ${label} is required`);
  }

  return value;
}
