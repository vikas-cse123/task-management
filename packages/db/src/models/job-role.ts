import { JOB_ROLE_KEYS, type JobRoleKey } from '@interscale/shared';
import mongoose from 'mongoose';
import type { HydratedDocument, Model, Types } from 'mongoose';

const { Schema, model, models } = mongoose;

/**
 * Seeded functional job-role reference data.
 *
 * Functional job roles are independent of application access levels. An
 * employee may hold multiple roles, potentially spanning departments.
 */
export interface JobRole {
  key: JobRoleKey;
  name: string;
  departmentId: Types.ObjectId;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export type JobRoleDocument = HydratedDocument<JobRole>;

export const jobRoleSchema = new Schema<JobRole>(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      immutable: true,
      enum: [...JOB_ROLE_KEYS],
    },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    departmentId: { type: Schema.Types.ObjectId, ref: 'Department', required: true, index: true },
    description: { type: String, trim: true, default: null, maxlength: 1000 },
  },
  { timestamps: true, versionKey: false },
);

export const JobRoleModel: Model<JobRole> =
  (models['JobRole'] as Model<JobRole> | undefined) ?? model<JobRole>('JobRole', jobRoleSchema);
