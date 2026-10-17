import type { AuditAction, AuditEntityType } from '@interscale/shared';
import type { ClientSession } from 'mongoose';
import { assertObjectId } from '../lib/object-id';
import { AuditLogModel } from '../models/audit-log';

/**
 * Sanitized audit entry.
 *
 * Callers must pass sanitized values: never plaintext passwords, tokens, or
 * other secrets. `actorId` is nullable for system-initiated actions such as the
 * initial Admin bootstrap.
 */
export interface RecordAuditInput {
  actorId?: string | null;
  action: AuditAction;
  entityType: AuditEntityType;
  entityId: string;
  previousValue?: unknown;
  newValue?: unknown;
  notes?: string | null;
  session?: ClientSession;
}

/**
 * Append a sanitized audit record.
 *
 * Returns the created audit log id. When a `session` is provided the write
 * participates in the caller's transaction so the audit entry is rolled back
 * together with the change it describes.
 */
export async function recordAudit(input: RecordAuditInput): Promise<string> {
  const entityId = assertObjectId(input.entityId, 'audit entity');
  const actorId = input.actorId ? assertObjectId(input.actorId, 'audit actor') : null;

  const [document] = await AuditLogModel.create(
    [
      {
        actorId,
        action: input.action,
        entityType: input.entityType,
        entityId,
        previousValue: input.previousValue ?? null,
        newValue: input.newValue ?? null,
        notes: input.notes ?? null,
      },
    ],
    input.session ? { session: input.session } : {},
  );

  if (!document) {
    throw new Error('Failed to write audit log entry');
  }

  return document._id.toString();
}

/** Sanitized audit entry for activity views (project/task history). */
export interface AuditEntryView {
  id: string;
  actorId: string | null;
  action: AuditAction;
  entityType: AuditEntityType;
  entityId: string;
  previousValue: unknown;
  newValue: unknown;
  notes: string | null;
  createdAt: string;
}

/**
 * List audit entries for one entity, newest first.
 *
 * Powers project/task activity views. Callers enforce scope before reading.
 */
export async function listEntityActivity(
  entityType: AuditEntityType,
  entityId: string,
  limit = 100,
): Promise<AuditEntryView[]> {
  const objectId = assertObjectId(entityId, 'audit entity');

  const documents = await AuditLogModel.find({ entityType, entityId: objectId })
    .sort({ createdAt: -1 })
    .limit(Math.max(1, Math.min(limit, 500)))
    .lean();

  return documents.map((doc) => ({
    id: doc._id.toString(),
    actorId: doc.actorId ? doc.actorId.toString() : null,
    action: doc.action,
    entityType: doc.entityType,
    entityId: doc.entityId.toString(),
    previousValue: doc.previousValue ?? null,
    newValue: doc.newValue ?? null,
    notes: doc.notes ?? null,
    createdAt:
      doc.createdAt instanceof Date ? doc.createdAt.toISOString() : new Date(0).toISOString(),
  }));
}
