import mongoose from 'mongoose';
import type { HydratedDocument, Model, Types } from 'mongoose';

const { Schema, model, models } = mongoose;

/**
 * A prerequisite edge between two template nodes (Phase 4, Step 19.6).
 *
 * Stored as version-scoped node keys, never live task ids. During
 * instantiation the keys are mapped to the newly created real Task ids, and the
 * edge is persisted as a real Phase 3 `TaskDependency` — there is no parallel
 * dependency engine.
 */
export interface TemplateDependency {
  templateId: Types.ObjectId;
  templateVersionId: Types.ObjectId;
  version: number;
  predecessorNodeKey: string;
  successorNodeKey: string;
  createdAt: Date;
  updatedAt: Date;
}

export type TemplateDependencyDocument = HydratedDocument<TemplateDependency>;

export const templateDependencySchema = new Schema<TemplateDependency>(
  {
    templateId: { type: Schema.Types.ObjectId, ref: 'Template', required: true, index: true },
    templateVersionId: {
      type: Schema.Types.ObjectId,
      ref: 'TemplateVersion',
      required: true,
      index: true,
    },
    version: { type: Number, required: true, min: 1 },
    predecessorNodeKey: { type: String, required: true, trim: true, maxlength: 80 },
    successorNodeKey: { type: String, required: true, trim: true, maxlength: 80 },
  },
  { timestamps: true, versionKey: false },
);

templateDependencySchema.index(
  { templateVersionId: 1, predecessorNodeKey: 1, successorNodeKey: 1 },
  { unique: true, name: 'uniq_template_dependency_edge' },
);

export const TemplateDependencyModel: Model<TemplateDependency> =
  (models['TemplateDependency'] as Model<TemplateDependency> | undefined) ??
  model<TemplateDependency>('TemplateDependency', templateDependencySchema);
