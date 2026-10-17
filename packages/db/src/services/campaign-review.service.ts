import mongoose from 'mongoose';
import { addDaysAtIst, formatIstDate } from '../lib/deadlines';
import { CampaignReviewOccurrenceModel } from '../models/campaign-review-occurrence';
import { CampaignReviewScheduleModel } from '../models/campaign-review-schedule';
import { ProjectModel } from '../models/project';
import { notifyCampaignReviewDue } from './task-notifications.service';
import type { NotificationServiceOptions } from './notification.service';

/**
 * Recurring campaign-review automation (Phase 5, Step 28).
 *
 * A project generated from a template that declares a `weekly_review` node gets
 * one schedule. On each due period the worker records an occurrence (once,
 * guarded by a unique index) and notifies the project manager. Because the
 * occurrence ledger is the idempotency key, a worker restart or a second worker
 * can never generate the same period twice.
 */

export const CAMPAIGN_REVIEW_BATCH_LIMIT = 200;

export interface EnsureCampaignReviewScheduleInput {
  projectId: string;
  clientId: string;
  anchorAt: Date;
  intervalDays: number;
  sourceNodeKey?: string;
  assigneeUserId?: string | null;
  createdBy?: string | null;
}

function objectId(value: string, label: string): mongoose.Types.ObjectId {
  if (!mongoose.Types.ObjectId.isValid(value)) {
    throw new Error(`Invalid ${label} identifier`);
  }

  return new mongoose.Types.ObjectId(value);
}

/** Create the per-project schedule once (idempotent on the project unique index). */
export async function ensureCampaignReviewSchedule(
  input: EnsureCampaignReviewScheduleInput,
  options: NotificationServiceOptions = {},
): Promise<void> {
  const session = options.session ? { session: options.session } : {};

  await CampaignReviewScheduleModel.updateOne(
    { projectId: objectId(input.projectId, 'project') },
    {
      $setOnInsert: {
        projectId: objectId(input.projectId, 'project'),
        clientId: objectId(input.clientId, 'client'),
        sourceNodeKey: input.sourceNodeKey ?? 'weekly_review',
        enabled: true,
        intervalDays: input.intervalDays,
        anchorAt: input.anchorAt,
        nextRunAt: input.anchorAt,
        lastRunAt: null,
        assigneeUserId: input.assigneeUserId ? objectId(input.assigneeUserId, 'assignee') : null,
        createdBy: input.createdBy ? objectId(input.createdBy, 'creator') : null,
      },
    },
    { upsert: true, ...session },
  );
}

export interface CampaignReviewRunSummary {
  generated: number;
  notified: number;
}

/**
 * Generate every campaign-review occurrence that is now due.
 *
 * Each schedule advances by one interval; the occurrence ledger guarantees
 * exactly-once generation and the schedule advance is filtered on the previous
 * `nextRunAt` value so concurrent workers cannot skip a period.
 */
export async function runDueCampaignReviews(
  input: { now?: Date } = {},
  options: NotificationServiceOptions = {},
): Promise<CampaignReviewRunSummary> {
  const now = input.now ?? new Date();
  const session = options.session ? { session: options.session } : {};

  const schedules = await CampaignReviewScheduleModel.find({
    enabled: true,
    nextRunAt: { $lte: now },
  })
    .sort({ nextRunAt: 1 })
    .limit(CAMPAIGN_REVIEW_BATCH_LIMIT)
    .lean();

  let generated = 0;
  let notified = 0;

  for (const schedule of schedules) {
    const periodKey = formatIstDate(schedule.nextRunAt);
    const periodEnd = addDaysAtIst(schedule.nextRunAt, schedule.intervalDays, '09:00');

    try {
      await CampaignReviewOccurrenceModel.create(
        [
          {
            scheduleId: schedule._id,
            projectId: schedule.projectId,
            periodKey,
            periodStart: schedule.nextRunAt,
            periodEnd,
            taskId: null,
          },
        ],
        session,
      );

      generated += 1;
    } catch (error) {
      if (
        typeof error === 'object' &&
        error !== null &&
        (error as { code?: unknown }).code === 11000
      ) {
        // Already generated for this period; fall through to the advance.
      } else {
        throw error;
      }
    }

    const project = await ProjectModel.findById(schedule.projectId).select({ managerId: 1 }).lean();

    const recipientUserId = schedule.assigneeUserId
      ? schedule.assigneeUserId.toString()
      : (project?.managerId?.toString() ?? null);

    if (recipientUserId) {
      const result = await notifyCampaignReviewDue(
        {
          projectId: schedule.projectId.toString(),
          periodKey,
          periodLabel: periodKey,
          recipientUserId,
        },
        options,
      );

      if (result?.created) {
        notified += 1;
      }
    }

    await CampaignReviewScheduleModel.updateOne(
      { _id: schedule._id, nextRunAt: schedule.nextRunAt },
      { $set: { nextRunAt: periodEnd, lastRunAt: now } },
      session,
    );
  }

  return { generated, notified };
}
