import {
  CLIENT_TEAM_ROLES,
  DEFAULT_CLIENT_TEAM_ROLE,
  type ClientTeamRole,
} from '@interscale/shared';
import mongoose from 'mongoose';
import type { HydratedDocument, Model, Types } from 'mongoose';
import { BETTER_AUTH_USER_MODEL } from '../identity';

const { Schema, model, models } = mongoose;

/**
 * Membership of a user in a client's team.
 *
 * Active membership defines Manager scope (docs/03-authorization.md). There is
 * at most one membership per client/user pair; membership is deactivated rather
 * than deleted so that history and references are preserved.
 */
export interface ClientTeamMember {
  clientId: Types.ObjectId;
  userId: Types.ObjectId;
  roleInTeam: ClientTeamRole;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type ClientTeamMemberDocument = HydratedDocument<ClientTeamMember>;

export const clientTeamMemberSchema = new Schema<ClientTeamMember>(
  {
    clientId: { type: Schema.Types.ObjectId, ref: 'Client', required: true },
    userId: { type: Schema.Types.ObjectId, ref: BETTER_AUTH_USER_MODEL, required: true },
    roleInTeam: {
      type: String,
      required: true,
      enum: [...CLIENT_TEAM_ROLES],
      default: DEFAULT_CLIENT_TEAM_ROLE,
    },
    isActive: { type: Boolean, required: true, default: true },
  },
  { timestamps: true },
);

clientTeamMemberSchema.index(
  { clientId: 1, userId: 1 },
  { unique: true, name: 'uniq_client_team_member' },
);
clientTeamMemberSchema.index({ clientId: 1, isActive: 1 });
clientTeamMemberSchema.index({ userId: 1, isActive: 1 });

export const ClientTeamMemberModel: Model<ClientTeamMember> =
  (models['ClientTeamMember'] as Model<ClientTeamMember> | undefined) ??
  model<ClientTeamMember>('ClientTeamMember', clientTeamMemberSchema);
