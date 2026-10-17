import { DEFAULT_REVIEW_INTERVAL_DAYS } from '@interscale/shared';
import mongoose from 'mongoose';
import type { HydratedDocument, Model, Types } from 'mongoose';
import { BETTER_AUTH_USER_MODEL } from '../identity';

const { Schema, model, models } = mongoose;

/**
 * Per-project recurring campaign-review schedule (Phase 5).
 *
 * Created the first time a project is Live and its template declares a
 * `weekly_review` node. `nextRunAt` advances by `intervalDays`; each generated
 * period is recorded once in `CampaignReviewOccurrence`, so a restart or a
 * concurrent worker can never duplicate a period's review task.
 */
export interface CampaignReviewSchedule {
  projectId: Types.ObjectId;
  clientId: Types.ObjectId;
  /** Template node key this schedule instantiates (defaults to weekly_review). */
  sourceNodeKey: string;
  enabled: boolean;
  intervalDays: number;
  anchorAt: Date;
  nextRunAt: Date;
  lastRunAt: Date | null;
  assigneeUserId: Types.ObjectId | null;
  createdBy: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

export type CampaignReviewScheduleDocument = HydratedDocument<CampaignReviewSchedule>;

export const campaignReviewScheduleSchema = new Schema<CampaignReviewSchedule>(
  {
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true },
    clientId: { type: Schema.Types.ObjectId, ref: 'Client', required: true },
    sourceNodeKey: { type: String, required: true, trim: true, default: 'weekly_review' },
    enabled: { type: Boolean, required: true, default: true },
    intervalDays: {
      type: Number,
      required: true,
      default: DEFAULT_REVIEW_INTERVAL_DAYS,
      min: 1,
      max: 90,
    },
    anchorAt: { type: Date, required: true },
    nextRunAt: { type: Date, required: true },
    lastRunAt: { type: Date, default: null },
    assigneeUserId: { type: Schema.Types.ObjectId, ref: BETTER_AUTH_USER_MODEL, default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: BETTER_AUTH_USER_MODEL, default: null },
  },
  { timestamps: true },
);

campaignReviewScheduleSchema.index(
  { projectId: 1 },
  { unique: true, name: 'uniq_campaign_review_schedule' },
);
campaignReviewScheduleSchema.index({ enabled: 1, nextRunAt: 1 });

export const CampaignReviewScheduleModel: Model<CampaignReviewSchedule> =
  (models['CampaignReviewSchedule'] as Model<CampaignReviewSchedule> | undefined) ??
  model<CampaignReviewSchedule>('CampaignReviewSchedule', campaignReviewScheduleSchema);
