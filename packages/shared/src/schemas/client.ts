import { z } from 'zod';
import { CLIENT_STATUSES, DEFAULT_CLIENT_STATUS } from '../enums/client-status';
import { objectIdSchema, shortTextSchema } from './primitives';

const clientNameSchema = shortTextSchema.max(160);

const clientStatusSchema = z.enum(CLIENT_STATUSES);

/** A client reference to the responsible primary Manager (Better Auth user id). */
const primaryManagerIdSchema = objectIdSchema.nullable();

export const createClientInputSchema = z.object({
  name: clientNameSchema,
  status: clientStatusSchema.default(DEFAULT_CLIENT_STATUS),
  primaryManagerId: primaryManagerIdSchema.optional(),
});

export type CreateClientInput = z.infer<typeof createClientInputSchema>;

export const updateClientInputSchema = z
  .object({
    name: clientNameSchema.optional(),
    status: clientStatusSchema.optional(),
    primaryManagerId: primaryManagerIdSchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field must be provided',
  });

export type UpdateClientInput = z.infer<typeof updateClientInputSchema>;
