import {
  DEFAULT_MEETING_STATUS,
  DEFAULT_TIMEZONE,
  MEETING_STATUSES,
  type MeetingStatus,
} from '@interscale/shared';
import mongoose from 'mongoose';
import type { HydratedDocument, Model, Types } from 'mongoose';
import { BETTER_AUTH_USER_MODEL } from '../identity';

const { Schema, model, models } = mongoose;

/**
 * A client meeting (Phase 6, Step 31).
 *
 * Meetings are independent records — never tasks. A meeting may later generate
 * real tasks through action items (`meetingActionItems`), but the meeting itself
 * stays separate. `startsAt`/`endsAt` are stored in UTC; `timezone` is the
 * display zone used to interpret the entered wall-clock time (Asia/Kolkata for
 * this India-based team, no per-user selection).
 *
 * `scheduleVersion` is bumped on every reschedule so a stale one-hour reminder
 * can be distinguished from the current schedule (Phase 6 Step 32/34). The
 * `rescheduled`, `completed`, `cancelled` timestamps feed calendar/audit views.
 */
export interface Meeting {
  clientId: Types.ObjectId;
  projectId: Types.ObjectId | null;
  title: string;
  agenda: string | null;
  startsAt: Date;
  endsAt: Date;
  timezone: string;
  ownerUserId: Types.ObjectId;
  attendeeUserIds: Types.ObjectId[];
  meetingUrl: string | null;
  location: string | null;
  status: MeetingStatus;
  discussionNotes: string | null;
  decisions: string[];
  rescheduledAt: Date | null;
  completedAt: Date | null;
  cancelledAt: Date | null;
  cancellationReason: string | null;
  scheduleVersion: number;
  createdBy: Types.ObjectId | null;
  updatedBy: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

export type MeetingDocument = HydratedDocument<Meeting>;

export const meetingSchema = new Schema<Meeting>(
  {
    clientId: { type: Schema.Types.ObjectId, ref: 'Client', required: true },
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', default: null },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    agenda: { type: String, default: null, maxlength: 5000 },
    startsAt: { type: Date, required: true },
    endsAt: { type: Date, required: true },
    timezone: {
      type: String,
      required: true,
      default: DEFAULT_TIMEZONE,
      trim: true,
      maxlength: 64,
    },
    ownerUserId: { type: Schema.Types.ObjectId, ref: BETTER_AUTH_USER_MODEL, required: true },
    attendeeUserIds: {
      type: [{ type: Schema.Types.ObjectId, ref: BETTER_AUTH_USER_MODEL }],
      default: [],
    },
    meetingUrl: { type: String, default: null, maxlength: 2000 },
    location: { type: String, default: null, maxlength: 300 },
    status: {
      type: String,
      required: true,
      enum: [...MEETING_STATUSES],
      default: DEFAULT_MEETING_STATUS,
    },
    discussionNotes: { type: String, default: null, maxlength: 10_000 },
    decisions: { type: [String], default: [] },
    rescheduledAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    cancelledAt: { type: Date, default: null },
    cancellationReason: { type: String, default: null, maxlength: 1000 },
    scheduleVersion: { type: Number, required: true, default: 1, min: 1 },
    createdBy: { type: Schema.Types.ObjectId, ref: BETTER_AUTH_USER_MODEL, default: null },
    updatedBy: { type: Schema.Types.ObjectId, ref: BETTER_AUTH_USER_MODEL, default: null },
  },
  { timestamps: true, optimisticConcurrency: true },
);

// Query-driven indexes (Step 31.12): scope + schedule/calendar lookups.
meetingSchema.index({ clientId: 1, startsAt: 1 });
meetingSchema.index({ projectId: 1, startsAt: 1 });
meetingSchema.index({ ownerUserId: 1, startsAt: 1 });
meetingSchema.index({ status: 1, startsAt: 1 });
meetingSchema.index({ attendeeUserIds: 1, startsAt: 1 });

export const MeetingModel: Model<Meeting> =
  (models['Meeting'] as Model<Meeting> | undefined) ?? model<Meeting>('Meeting', meetingSchema);
