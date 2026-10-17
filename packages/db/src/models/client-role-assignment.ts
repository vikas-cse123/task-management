import mongoose from 'mongoose';
import type { HydratedDocument, Model, Types } from 'mongoose';
import { BETTER_AUTH_USER_MODEL } from '../identity';

const { Schema, model, models } = mongoose;

/**
 * Designated employee for a functional job role at a client.
 *
 * A client may designate several employees per role, but at most one may be the
 * *active primary* designated employee. That invariant is enforced by a partial
 * unique index (`uniq_active_primary_per_client_role`).
 *
 * Integrity rules (enforced in the service layer):
 * - the employee must exist, be active, and hold the corresponding job role;
 * - assigning a designated employee creates the client team membership in the
 *   same transaction.
 */
export interface ClientRoleAssignment {
  clientId: Types.ObjectId;
  jobRoleId: Types.ObjectId;
  userId: Types.ObjectId;
  isPrimary: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type ClientRoleAssignmentDocument = HydratedDocument<ClientRoleAssignment>;

export const clientRoleAssignmentSchema = new Schema<ClientRoleAssignment>(
  {
    clientId: { type: Schema.Types.ObjectId, ref: 'Client', required: true },
    jobRoleId: { type: Schema.Types.ObjectId, ref: 'JobRole', required: true },
    userId: { type: Schema.Types.ObjectId, ref: BETTER_AUTH_USER_MODEL, required: true },
    isPrimary: { type: Boolean, required: true, default: false },
    isActive: { type: Boolean, required: true, default: true },
  },
  { timestamps: true, optimisticConcurrency: true },
);

clientRoleAssignmentSchema.index(
  { clientId: 1, jobRoleId: 1, userId: 1 },
  { unique: true, name: 'uniq_client_role_user' },
);

clientRoleAssignmentSchema.index(
  { clientId: 1, jobRoleId: 1 },
  {
    unique: true,
    name: 'uniq_active_primary_per_client_role',
    partialFilterExpression: { isActive: true, isPrimary: true },
  },
);

clientRoleAssignmentSchema.index({ clientId: 1, isActive: 1 });
clientRoleAssignmentSchema.index({ userId: 1, isActive: 1 });

export const ClientRoleAssignmentModel: Model<ClientRoleAssignment> =
  (models['ClientRoleAssignment'] as Model<ClientRoleAssignment> | undefined) ??
  model<ClientRoleAssignment>('ClientRoleAssignment', clientRoleAssignmentSchema);
