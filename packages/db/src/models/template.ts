import {
  DEFAULT_TEMPLATE_STATUS,
  DEFAULT_TEMPLATE_TYPE,
  TEMPLATE_STATUSES,
  TEMPLATE_TYPES,
  type TemplateStatus,
  type TemplateType,
} from '@interscale/shared';
import mongoose from 'mongoose';
import type { HydratedDocument, Model, Types } from 'mongoose';
import { BETTER_AUTH_USER_MODEL } from '../identity';

const { Schema, model, models } = mongoose;

/**
 * Reusable, Admin-managed project template (Phase 4, Step 19).
 *
 * Identity is the stable `key`, never the editable name. A template owns an
 * ordered set of {@link TemplateVersion} documents; `currentPublishedVersion`
 * points at the newest published version and is the default selected by project
 * creation. Templates are never bound to a client here — binding happens only
 * at instantiation.
 */
export interface Template {
  key: string;
  name: string;
  description: string | null;
  type: TemplateType;
  status: TemplateStatus;
  currentPublishedVersion: number | null;
  createdBy: Types.ObjectId | null;
  updatedBy: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

export type TemplateDocument = HydratedDocument<Template>;

export const templateSchema = new Schema<Template>(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      immutable: true,
      trim: true,
      maxlength: 60,
    },
    name: { type: String, required: true, trim: true, maxlength: 160 },
    description: { type: String, default: null, maxlength: 2000 },
    type: {
      type: String,
      required: true,
      enum: [...TEMPLATE_TYPES],
      default: DEFAULT_TEMPLATE_TYPE,
    },
    status: {
      type: String,
      required: true,
      enum: [...TEMPLATE_STATUSES],
      default: DEFAULT_TEMPLATE_STATUS,
    },
    currentPublishedVersion: { type: Number, default: null, min: 1 },
    createdBy: { type: Schema.Types.ObjectId, ref: BETTER_AUTH_USER_MODEL, default: null },
    updatedBy: { type: Schema.Types.ObjectId, ref: BETTER_AUTH_USER_MODEL, default: null },
  },
  { timestamps: true, optimisticConcurrency: true },
);

templateSchema.index({ status: 1 });
templateSchema.index({ type: 1 });

export const TemplateModel: Model<Template> =
  (models['Template'] as Model<Template> | undefined) ??
  model<Template>('Template', templateSchema);
