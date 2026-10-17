import {
  getNotificationSettings,
  scanTaskDeadlines,
  type DeadlineScanSummary,
} from '@interscale/db';
import { logger } from '../lib/logger';

export const DEADLINE_SCAN_JOB = 'notifications.deadlineScan';

/** Scan open tasks for due-soon / overdue reminders and manager escalations. */
export async function runDeadlineScan(): Promise<DeadlineScanSummary> {
  const settings = await getNotificationSettings();

  const summary = await scanTaskDeadlines({
    dueSoonLeadHours: settings.dueSoonLeadHours,
    escalationAfterHours: settings.escalationAfterHours,
  });

  if (summary.dueSoon > 0 || summary.overdue > 0 || summary.escalated > 0) {
    logger.info(summary, 'Deadline scan completed');
  }

  return summary;
}
