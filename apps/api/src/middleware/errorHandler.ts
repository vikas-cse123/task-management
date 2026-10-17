import { DomainError } from '@interscale/db';
import { API_ERROR_CODES, type ApiErrorCode } from '@interscale/shared';
import { APIError } from 'better-auth';
import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { ApiError, concurrentModificationError } from '../lib/http';
import { logger } from '../lib/logger';

export function notFoundHandler(req: Request, _res: Response, next: NextFunction): void {
  next(new ApiError('NOT_FOUND', `Route ${req.method} ${req.originalUrl} not found`));
}

function statusToCode(statusCode: number): ApiErrorCode {
  switch (statusCode) {
    case 401:
      return 'UNAUTHENTICATED';
    case 403:
      return 'FORBIDDEN';
    case 404:
      return 'NOT_FOUND';
    case 409:
      return 'CONFLICT';
    case 429:
      return 'RATE_LIMITED';
    case 400:
    case 422:
      return 'VALIDATION_ERROR';
    default:
      return 'INTERNAL_ERROR';
  }
}

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 11000
  );
}

function isVersionError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { name?: unknown }).name === 'VersionError'
  );
}

/**
 * Centralized error handler. Produces a single response envelope:
 *   { error: { code, message, details?, requestId } }
 */
export function errorHandler(
  error: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const requestId = req.requestId;

  const send = (statusCode: number, code: string, message: string, details?: unknown): void => {
    res.status(statusCode).json({
      error: {
        code,
        message,
        ...(details === undefined ? {} : { details }),
        requestId,
      },
    });
  };

  if (error instanceof ZodError) {
    send(422, 'VALIDATION_ERROR', 'Request validation failed', error.issues);
    return;
  }

  if (error instanceof ApiError) {
    send(error.statusCode, error.code, error.message, error.details);
    return;
  }

  if (error instanceof APIError) {
    const statusCode = typeof error.statusCode === 'number' ? error.statusCode : 500;
    const body = (error.body ?? {}) as { message?: string; code?: string };
    const code =
      body.code && (API_ERROR_CODES as readonly string[]).includes(body.code)
        ? (body.code as ApiErrorCode)
        : statusToCode(statusCode);
    const message = body.message ?? error.message;
    const httpStatus =
      statusCode === 400 ? 422 : statusCode >= 400 && statusCode < 600 ? statusCode : 500;

    send(httpStatus, code, message);
    return;
  }

  if (error instanceof DomainError) {
    const statusByCode: Record<string, number> = {
      NOT_FOUND: 404,
      FORBIDDEN: 403,
      UNAUTHENTICATED: 401,
      VALIDATION_ERROR: 422,
      CONFLICT: 409,
      CONCURRENT_MODIFICATION: 409,
      RATE_LIMITED: 429,
      INTERNAL_ERROR: 500,
    };

    send(statusByCode[error.code] ?? 500, error.code, error.message);
    return;
  }

  if (isDuplicateKeyError(error)) {
    send(409, 'CONFLICT', 'A record with the same unique value already exists');
    return;
  }

  if (isVersionError(error)) {
    const apiError = concurrentModificationError();
    send(apiError.statusCode, apiError.code, apiError.message);
    return;
  }

  logger.error({ err: error, requestId }, 'Unhandled error');

  send(500, 'INTERNAL_ERROR', 'An unexpected error occurred');
}
