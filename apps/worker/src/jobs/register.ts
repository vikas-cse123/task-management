import type { Agenda } from 'agenda';
import { workerEnv } from '../config/env';
import { logger } from '../lib/logger';
import { CAMPAIGN_REVIEW_JOB, runCampaignReview } from './campaign-review';
import { DEADLINE_SCAN_JOB, runDeadlineScan } from './deadline-reminders';
import { NOTIFICATION_DISPATCH_JOB, runNotificationDispatch } from './notification-dispatch';

/**
 * Register every worker job definition (Phase 5).
 *
 * Definitions are pure: they only call the shared database services. Delivery
 * policy (retries, suppression, revalidation) lives in the engine, not here.
 */
export function registerJobDefinitions(agenda: Agenda): void {
  agenda.define(NOTIFICATION_DISPATCH_JOB, async () => {
    await runNotificationDispatch();
  });

  agenda.define(DEADLINE_SCAN_JOB, async () => {
    await runDeadlineScan();
  });

  agenda.define(CAMPAIGN_REVIEW_JOB, async () => {
    await runCampaignReview();
  });
}

/** Schedule the recurring sweeps. Safe to call on every worker start. */
export async function scheduleRecurringJobs(agenda: Agenda): Promise<void> {
  await agenda.every(workerEnv.WORKER_NOTIFICATION_INTERVAL, NOTIFICATION_DISPATCH_JOB);
  await agenda.every(workerEnv.WORKER_DEADLINE_INTERVAL, DEADLINE_SCAN_JOB);
  await agenda.every(workerEnv.WORKER_CAMPAIGN_REVIEW_INTERVAL, CAMPAIGN_REVIEW_JOB);

  logger.info(
    {
      dispatch: workerEnv.WORKER_NOTIFICATION_INTERVAL,
      deadline: workerEnv.WORKER_DEADLINE_INTERVAL,
      campaignReview: workerEnv.WORKER_CAMPAIGN_REVIEW_INTERVAL,
    },
    'Recurring notification jobs scheduled',
  );
}
