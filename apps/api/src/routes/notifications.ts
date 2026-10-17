import {
  notificationCenterQuerySchema,
  notificationLogQuerySchema,
  updateNotificationSettingsInputSchema,
  updateNotificationTemplateMappingsInputSchema,
  whatsappConsentInputSchema,
  type UserProfile,
} from '@interscale/shared';
import { Router } from 'express';
import type { Auth } from '../auth/auth';
import { requireActiveSession, requireAdmin } from '../auth/middleware';
import { asyncHandler } from '../lib/async-handler';
import { notFoundError, pathParam, unauthorizedError } from '../lib/http';
import type { NotificationApiService } from '../services/notifications';

/**
 * Notification center, consent, and Admin notification administration
 * (Phase 5, Step 29).
 *
 * Mounted at the API root so `/notifications/*`, `/me/notification-consent`,
 * and `/notification-settings/*` share one router. Self-service routes require
 * an active session; workspace settings, logs, statistics, and retries are
 * Admin-only.
 */
export function createNotificationsRouter(
  auth: Auth,
  notifications: NotificationApiService,
): Router {
  const router = Router();
  const session = requireActiveSession(auth);
  const admin = requireAdmin();

  function actor(req: { auth?: { profile: UserProfile } }): UserProfile {
    const profile = req.auth?.profile;

    if (!profile) {
      throw unauthorizedError();
    }

    return profile;
  }

  router.get(
    '/notifications',
    ...session,
    asyncHandler(async (req, res) => {
      const query = notificationCenterQuerySchema.parse(req.query);
      const page = await notifications.listCenter(actor(req), query);

      res.status(200).json({ data: page.data, page: { nextCursor: page.nextCursor } });
    }),
  );

  router.get(
    '/notifications/unread-count',
    ...session,
    asyncHandler(async (req, res) => {
      const count = await notifications.getUnreadCount(actor(req));

      res.status(200).json({ data: { count } });
    }),
  );

  router.post(
    '/notifications/read-all',
    ...session,
    asyncHandler(async (req, res) => {
      const updated = await notifications.markAllRead(actor(req));

      res.status(200).json({ data: { updated } });
    }),
  );

  router.post(
    '/notifications/:id/read',
    ...session,
    asyncHandler(async (req, res) => {
      const updated = await notifications.markRead(
        actor(req),
        pathParam(req.params.id, 'notification'),
      );

      if (!updated) {
        throw notFoundError('Notification not found');
      }

      res.status(200).json({ data: { updated: true } });
    }),
  );

  router.post(
    '/me/notification-consent',
    ...session,
    asyncHandler(async (req, res) => {
      const input = whatsappConsentInputSchema.parse(req.body ?? {});
      const consent = await notifications.updateConsent(actor(req), input);

      res.status(200).json({ data: consent });
    }),
  );

  router.get(
    '/notification-settings',
    ...session,
    admin,
    asyncHandler(async (_req, res) => {
      res.status(200).json({ data: await notifications.getSettings() });
    }),
  );

  router.patch(
    '/notification-settings',
    ...session,
    admin,
    asyncHandler(async (req, res) => {
      const input = updateNotificationSettingsInputSchema.parse(req.body ?? {});

      res.status(200).json({ data: await notifications.updateSettings(actor(req), input) });
    }),
  );

  router.get(
    '/notification-settings/templates',
    ...session,
    admin,
    asyncHandler(async (_req, res) => {
      res.status(200).json({ data: await notifications.getTemplateMappings() });
    }),
  );

  router.patch(
    '/notification-settings/templates',
    ...session,
    admin,
    asyncHandler(async (req, res) => {
      const input = updateNotificationTemplateMappingsInputSchema.parse(req.body ?? {});

      res.status(200).json({ data: await notifications.updateTemplateMappings(actor(req), input) });
    }),
  );

  router.get(
    '/notification-settings/stats',
    ...session,
    admin,
    asyncHandler(async (_req, res) => {
      res.status(200).json({ data: await notifications.getStats() });
    }),
  );

  router.get(
    '/notification-settings/integration',
    ...session,
    admin,
    asyncHandler(async (_req, res) => {
      res.status(200).json({ data: await notifications.getIntegrationStatus() });
    }),
  );

  router.get(
    '/notification-logs',
    ...session,
    admin,
    asyncHandler(async (req, res) => {
      const query = notificationLogQuerySchema.parse(req.query);
      const page = await notifications.listLogs(query);

      res.status(200).json({ data: page.data, page: { nextCursor: page.nextCursor } });
    }),
  );

  router.post(
    '/notification-outbox/:id/retry',
    ...session,
    admin,
    asyncHandler(async (req, res) => {
      const updated = await notifications.retry(pathParam(req.params.id, 'notification'));

      if (!updated) {
        throw notFoundError('A failed notification with that identifier was not found');
      }

      res.status(200).json({ data: { updated: true } });
    }),
  );

  return router;
}
