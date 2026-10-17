/**
 * Typed application error used for all expected (non-bug) failures so the
 * error middleware can produce a consistent response envelope.
 */
export class ApiError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(statusCode: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export function notFoundError(message = 'Resource not found'): ApiError {
  return new ApiError(404, 'NOT_FOUND', message);
}

export function forbiddenError(message = 'You do not have access to this resource'): ApiError {
  return new ApiError(403, 'FORBIDDEN', message);
}

export function unauthorizedError(message = 'Authentication required'): ApiError {
  return new ApiError(401, 'UNAUTHORIZED', message);
}
