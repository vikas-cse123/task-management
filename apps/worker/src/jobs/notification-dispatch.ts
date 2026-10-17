import {
  getNotificationSettings,
  processDueNotifications,
  type DispatchSummary,
  type ResolvedNotificationSettings,
} from '@interscale/db';
import { workerEnv } from '../config/env';
import { buildWhatsAppProvider, workerIdentity } from '../config/whatsapp';
import { logger } from '../lib/logger';

export const NOTIFICATION_DISPATCH_JOB = 'notifications.dispatch';

/**
 * One notification dispatch sweep.
 *
 * The channel is disabled at the environment level when the kill-switch is off,
 * so every queued record is suppressed (never sent) while in-app copies remain.
 */
export async function runNotificationDispatch(): Promise<DispatchSummary> {
  const settings = await getNotificationSettings();
  const effective: ResolvedNotificationSettings = workerEnv.WHATSAPP_NOTIFICATIONS_ENABLED
    ? settings
    : { ...settings, enabled: false };

  const summary = await processDueNotifications({
    provider: buildWhatsAppProvider(),
    settings: effective,
    workerId: workerIdentity(),
  });

  if (summary.claimed > 0) {
    logger.info(summary, 'Notification dispatch sweep completed');
  }

  return summary;
}
