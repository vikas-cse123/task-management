import mongoose from 'mongoose';
import type { HydratedDocument, Model, Types } from 'mongoose';
import { BETTER_AUTH_USER_MODEL } from '../identity';

const { Schema, model, models } = mongoose;

/**
 * Durable idempotency record for template-based project generation
 * (Phase 4, Step 22.6).
 *
 * `idempotencyKey` is globally unique. The stored `fingerprint` is a hash of
 * the normalized request; replaying the same key with an equivalent payload
 * returns the original project, while reusing the key with a different payload
 * is a conflict. Because the record is written inside the same transaction as
 * the project graph, concurrent duplicate requests resolve to exactly one
 * winner and the loser surfaces the existing result.
 */
export interface ProjectGeneration {
  idempotencyKey: string;
  fingerprint: string;
  actorId: Types.ObjectId | null;
  clientId: Types.ObjectId;
  templateId: Types.ObjectId;
  templateVersion: number;
  projectId: Types.ObjectId;
  warnings: unknown;
  createdAt: Date;
  updatedAt: Date;
}

export type ProjectGenerationDocument = HydratedDocument<ProjectGeneration>;

export const projectGenerationSchema = new Schema<ProjectGeneration>(
  {
    idempotencyKey: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      maxlength: 120,
    },
    fingerprint: { type: String, required: true, maxlength: 128 },
    actorId: { type: Schema.Types.ObjectId, ref: BETTER_AUTH_USER_MODEL, default: null },
    clientId: { type: Schema.Types.ObjectId, ref: 'Client', required: true, index: true },
    templateId: { type: Schema.Types.ObjectId, ref: 'Template', required: true },
    templateVersion: { type: Number, required: true, min: 1 },
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
    warnings: { type: Schema.Types.Mixed, default: null },
  },
  { timestamps: true, versionKey: false },
);

projectGenerationSchema.index({ clientId: 1, createdAt: -1 });

export const ProjectGenerationModel: Model<ProjectGeneration> =
  (models['ProjectGeneration'] as Model<ProjectGeneration> | undefined) ??
  model<ProjectGeneration>('ProjectGeneration', projectGenerationSchema);
