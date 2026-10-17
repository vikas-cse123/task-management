import { TEMPLATE_VERSION_STATUSES, type TemplateVersionStatus } from '@interscale/shared';
import mongoose from 'mongoose';
import type { HydratedDocument, Model, Types } from 'mongoose';
import { BETTER_AUTH_USER_MODEL } from '../identity';

const { Schema, model, models } = mongoose;

/**
 * One version of a template (Phase 4, Step 19.4).
 *
 * Versioning strategy: nodes and dependencies live in version-scoped
 * collections keyed by `_id` here, so a published version is immutable by
 * construction — editing always targets the single `draft` version. Publishing
 * a draft flips it to `published` and archives the previously published
 * version, keeping historical projects reproducible while allowing at most one
 * live published version per template.
 */
export interface TemplateVersion {
  templateId: Types.ObjectId;
  version: number;
  status: TemplateVersionStatus;
  notes: string | null;
  basedOnVersion: number | null;
  createdBy: Types.ObjectId | null;
  updatedBy: Types.ObjectId | null;
  publishedBy: Types.ObjectId | null;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export type TemplateVersionDocument = HydratedDocument<TemplateVersion>;

export const templateVersionSchema = new Schema<TemplateVersion>(
  {
    templateId: { type: Schema.Types.ObjectId, ref: 'Template', required: true, index: true },
    version: { type: Number, required: true, min: 1 },
    status: {
      type: String,
      required: true,
      enum: [...TEMPLATE_VERSION_STATUSES],
      default: 'draft',
    },
    notes: { type: String, default: null, maxlength: 1000 },
    basedOnVersion: { type: Number, default: null, min: 1 },
    createdBy: { type: Schema.Types.ObjectId, ref: BETTER_AUTH_USER_MODEL, default: null },
    updatedBy: { type: Schema.Types.ObjectId, ref: BETTER_AUTH_USER_MODEL, default: null },
    publishedBy: { type: Schema.Types.ObjectId, ref: BETTER_AUTH_USER_MODEL, default: null },
    publishedAt: { type: Date, default: null },
  },
  { timestamps: true, optimisticConcurrency: true },
);

templateVersionSchema.index(
  { templateId: 1, version: 1 },
  { unique: true, name: 'uniq_template_version' },
);
templateVersionSchema.index(
  { templateId: 1 },
  {
    unique: true,
    name: 'uniq_published_version_per_template',
    partialFilterExpression: { status: 'published' },
  },
);
templateVersionSchema.index({ templateId: 1, status: 1 });

export const TemplateVersionModel: Model<TemplateVersion> =
  (models['TemplateVersion'] as Model<TemplateVersion> | undefined) ??
  model<TemplateVersion>('TemplateVersion', templateVersionSchema);
