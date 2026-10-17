import mongoose from 'mongoose';
import type { HydratedDocument, Model, Types } from 'mongoose';

const { Schema, model, models } = mongoose;

/**
 * Ledger of generated campaign-review periods.
 *
 * The unique `{ projectId, periodKey }` index is the exactly-once guarantee for
 * recurring review tasks: a duplicate period insert fails and the worker treats
 * it as already-generated.
 */
export interface CampaignReviewOccurrence {
  scheduleId: Types.ObjectId;
  projectId: Types.ObjectId;
  /** Stable identifier of the period, e.g. the ISO date of the period start. */
  periodKey: string;
  periodStart: Date;
  periodEnd: Date;
  taskId: Types.ObjectId | null;
  createdAt: Date;
}

export type CampaignReviewOccurrenceDocument = HydratedDocument<CampaignReviewOccurrence>;

export const campaignReviewOccurrenceSchema = new Schema<CampaignReviewOccurrence>(
  {
    scheduleId: { type: Schema.Types.ObjectId, ref: 'CampaignReviewSchedule', required: true },
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true },
    periodKey: { type: String, required: true, trim: true, maxlength: 60 },
    periodStart: { type: Date, required: true },
    periodEnd: { type: Date, required: true },
    taskId: { type: Schema.Types.ObjectId, ref: 'Task', default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

campaignReviewOccurrenceSchema.index(
  { projectId: 1, periodKey: 1 },
  { unique: true, name: 'uniq_campaign_review_occurrence' },
);
campaignReviewOccurrenceSchema.index({ scheduleId: 1, createdAt: -1 });

export const CampaignReviewOccurrenceModel: Model<CampaignReviewOccurrence> =
  (models['CampaignReviewOccurrence'] as Model<CampaignReviewOccurrence> | undefined) ??
  model<CampaignReviewOccurrence>('CampaignReviewOccurrence', campaignReviewOccurrenceSchema);
