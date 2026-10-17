import {
  DEFAULT_PROJECT_STATUS,
  PROJECT_STATUSES,
  PROJECT_TYPES,
  type ProjectStatus,
  type ProjectType,
} from '@interscale/shared';
import mongoose from 'mongoose';
import type { HydratedDocument, Model, Types } from 'mongoose';
import { BETTER_AUTH_USER_MODEL } from '../identity';

const { Schema, model, models } = mongoose;

/**
 * A project belongs to exactly one client (Workspace → Client → Project).
 *
 * `managerId` is the assigned Project Manager (a Better Auth user): a
 * coordination role, not an access-level promotion and not a permission
 * grant. `templateId`/`templateVersion` are stored for Phase 4 template
 * compatibility and are never acted on in Phase 2.
 */
export interface Project {
  clientId: Types.ObjectId;
  name: string;
  description: string | null;
  type: ProjectType;
  status: ProjectStatus;
  managerId: Types.ObjectId | null;
  startAt: Date | null;
  targetAt: Date | null;
  templateId: Types.ObjectId | null;
  templateVersion: number | null;
  createdBy: Types.ObjectId;
  updatedBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export type ProjectDocument = HydratedDocument<Project>;

export const projectSchema = new Schema<Project>(
  {
    clientId: { type: Schema.Types.ObjectId, ref: 'Client', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 160 },
    description: { type: String, default: null, maxlength: 2000 },
    type: { type: String, required: true, enum: [...PROJECT_TYPES], index: true },
    status: {
      type: String,
      required: true,
      enum: [...PROJECT_STATUSES],
      default: DEFAULT_PROJECT_STATUS,
      index: true,
    },
    managerId: {
      type: Schema.Types.ObjectId,
      ref: BETTER_AUTH_USER_MODEL,
      default: null,
      index: true,
    },
    startAt: { type: Date, default: null },
    targetAt: { type: Date, default: null },
    templateId: { type: Schema.Types.ObjectId, default: null },
    templateVersion: { type: Number, default: null, min: 1 },
    createdBy: { type: Schema.Types.ObjectId, ref: BETTER_AUTH_USER_MODEL, required: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: BETTER_AUTH_USER_MODEL, required: true },
  },
  { timestamps: true, optimisticConcurrency: true },
);

projectSchema.index(
  { clientId: 1, name: 1 },
  { unique: true, name: 'uniq_project_name_per_client' },
);
projectSchema.index({ clientId: 1, status: 1 });
projectSchema.index({ status: 1, updatedAt: -1 });

export const ProjectModel: Model<Project> =
  (models['Project'] as Model<Project> | undefined) ?? model<Project>('Project', projectSchema);
