import {
  AUDIT_ACTIONS,
  AUDIT_ENTITY_TYPES,
  type AuditAction,
  type AuditEntityType,
} from '@interscale/shared';
import mongoose from 'mongoose';
import type { HydratedDocument, Model, Types } from 'mongoose';
import { BETTER_AUTH_USER_MODEL } from '../identity';

const { Schema, model, models } = mongoose;

/**
 * Append-only, sanitized audit history.
 *
 * Never store plaintext passwords or secrets. There is intentionally no TTL in
 * the MVP; a retention policy is a documented open decision (docs/decisions.md).
 */
export interface AuditLog {
  actorId: Types.ObjectId | null;
  action: AuditAction;
  entityType: AuditEntityType;
  entityId: Types.ObjectId;
  previousValue: unknown;
  newValue: unknown;
  notes: string | null;
  createdAt: Date;
}

export type AuditLogDocument = HydratedDocument<AuditLog>;

export const auditLogSchema = new Schema<AuditLog>(
  {
    actorId: { type: Schema.Types.ObjectId, ref: BETTER_AUTH_USER_MODEL, default: null },
    action: { type: String, required: true, enum: [...AUDIT_ACTIONS] },
    entityType: { type: String, required: true, enum: [...AUDIT_ENTITY_TYPES] },
    entityId: { type: Schema.Types.ObjectId, required: true },
    previousValue: { type: Schema.Types.Mixed, default: null },
    newValue: { type: Schema.Types.Mixed, default: null },
    notes: { type: String, trim: true, default: null, maxlength: 1000 },
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false },
);

auditLogSchema.index({ entityType: 1, entityId: 1, createdAt: -1 });
auditLogSchema.index({ actorId: 1, createdAt: -1 });
auditLogSchema.index({ createdAt: -1 });

export const AuditLogModel: Model<AuditLog> =
  (models['AuditLog'] as Model<AuditLog> | undefined) ??
  model<AuditLog>('AuditLog', auditLogSchema);
