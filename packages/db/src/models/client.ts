import { CLIENT_STATUSES, DEFAULT_CLIENT_STATUS, type ClientStatus } from '@interscale/shared';
import mongoose from 'mongoose';
import type { HydratedDocument, Model, Types } from 'mongoose';
import { BETTER_AUTH_USER_MODEL } from '../identity';

const { Schema, model, models } = mongoose;

/**
 * A client of the agency.
 *
 * `primaryManagerId` references the responsible primary Manager (a Better Auth
 * user). It is optional until a Manager is assigned.
 */
export interface Client {
  name: string;
  status: ClientStatus;
  primaryManagerId: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

export type ClientDocument = HydratedDocument<Client>;

export const clientSchema = new Schema<Client>(
  {
    name: { type: String, required: true, trim: true, unique: true, maxlength: 160 },
    status: {
      type: String,
      required: true,
      enum: [...CLIENT_STATUSES],
      default: DEFAULT_CLIENT_STATUS,
      index: true,
    },
    primaryManagerId: {
      type: Schema.Types.ObjectId,
      ref: BETTER_AUTH_USER_MODEL,
      default: null,
      index: true,
    },
  },
  { timestamps: true, optimisticConcurrency: true },
);

export const ClientModel: Model<Client> =
  (models['Client'] as Model<Client> | undefined) ?? model<Client>('Client', clientSchema);
