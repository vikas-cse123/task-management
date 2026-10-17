import { z } from 'zod';
import { objectIdSchema } from './primitives';

/**
 * Cursor pagination query.
 *
 * List endpoints return `{ data, page }`. `cursor` is the ObjectId of the last
 * item from the previous page where cursor ordering is supported.
 */
export const paginationQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: objectIdSchema.optional(),
});

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

export interface Page<T> {
  readonly data: T[];
  readonly nextCursor: string | null;
}
