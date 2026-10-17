import { z } from 'zod';
import { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } from '../enums/audit';
import { objectIdSchema } from './primitives';

/** Sanitized audit entry returned by activity endpoints. */
export const auditEntrySchema = z.object({
  id: objectIdSchema,
  actorId: objectIdSchema.nullable(),
  action: z.enum(AUDIT_ACTIONS),
  entityType: z.enum(AUDIT_ENTITY_TYPES),
  entityId: objectIdSchema,
  previousValue: z.unknown(),
  newValue: z.unknown(),
  notes: z.string().nullable(),
  createdAt: z.string(),
});

export type AuditEntry = z.infer<typeof auditEntrySchema>;
