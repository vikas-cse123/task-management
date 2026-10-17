import { z } from 'zod';

/**
 * Stable, machine-readable API error codes.
 *
 * Requirement references: 00 §17, §18 and docs/05-api.md.
 */
export const API_ERROR_CODES = [
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'NOT_FOUND',
  'VALIDATION_ERROR',
  'CONFLICT',
  'CONCURRENT_MODIFICATION',
  'RATE_LIMITED',
  'INTERNAL_ERROR',
] as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

export const apiErrorCodeSchema = z.enum(API_ERROR_CODES);

/** Default HTTP status for each error code. */
export const API_ERROR_STATUS: Record<ApiErrorCode, number> = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION_ERROR: 422,
  CONFLICT: 409,
  CONCURRENT_MODIFICATION: 409,
  RATE_LIMITED: 429,
  INTERNAL_ERROR: 500,
};

export const apiErrorBodySchema = z.object({
  code: apiErrorCodeSchema,
  message: z.string(),
  details: z.unknown().optional(),
  requestId: z.string().optional(),
});

export type ApiErrorBody = z.infer<typeof apiErrorBodySchema>;

export interface ApiErrorResponse {
  readonly error: ApiErrorBody;
}

export interface ApiSuccessResponse<T> {
  readonly data: T;
}

export function apiError(
  code: ApiErrorCode,
  message: string,
  details?: unknown,
  requestId?: string,
): ApiErrorResponse {
  return {
    error: {
      code,
      message,
      ...(details === undefined ? {} : { details }),
      ...(requestId === undefined ? {} : { requestId }),
    },
  };
}

export function apiSuccess<T>(data: T): ApiSuccessResponse<T> {
  return { data };
}
