import {
  cancelMeetingInputSchema,
  completeMeetingInputSchema,
  convertMeetingActionItemInputSchema,
  createMeetingActionItemInputSchema,
  createMeetingInputSchema,
  meetingCalendarQuerySchema,
  meetingListQuerySchema,
  meetingOverlapQuerySchema,
  rescheduleMeetingInputSchema,
  updateMeetingActionItemInputSchema,
  updateMeetingInputSchema,
  type UserProfile,
} from '@interscale/shared';
import { Router } from 'express';
import type { Auth } from '../auth/auth';
import { requireActiveSession } from '../auth/middleware';
import { asyncHandler } from '../lib/async-handler';
import { notFoundError, pathParam, unauthorizedError } from '../lib/http';
import type { MeetingService } from '../services/meetings';

/**
 * Meeting management (Phase 6, Step 31).
 *
 * Mounted at the API root so `/meetings/*`, `/clients/:clientId/meetings`,
 * `/projects/:projectId/meetings` and `/me/meetings` live in one router. Every
 * route requires a valid, active session that has cleared the forced password
 * change; scope and capability guards live in the service so out-of-scope
 * access returns 404.
 */
export function createMeetingsRouter(auth: Auth, meetings: MeetingService): Router {
  const router = Router();
  const session = requireActiveSession(auth);

  function actor(req: { auth?: { profile: UserProfile } }): UserProfile {
    const profile = req.auth?.profile;

    if (!profile) {
      throw unauthorizedError();
    }

    return profile;
  }

  router.get(
    '/meetings',
    ...session,
    asyncHandler(async (req, res) => {
      const query = meetingListQuerySchema.parse(req.query);
      const page = await meetings.listMeetings(actor(req), query);

      res.status(200).json({ data: page.data, page: { nextCursor: page.nextCursor } });
    }),
  );

  router.post(
    '/meetings',
    ...session,
    asyncHandler(async (req, res) => {
      const input = createMeetingInputSchema.parse(req.body);
      const created = await meetings.createMeeting(actor(req), input);

      res.status(201).json({ data: created });
    }),
  );

  router.get(
    '/meetings/summary',
    ...session,
    asyncHandler(async (req, res) => {
      const summary = await meetings.getMeetingSummary(actor(req));

      res.status(200).json({ data: summary });
    }),
  );

  router.get(
    '/meetings/calendar',
    ...session,
    asyncHandler(async (req, res) => {
      const query = meetingCalendarQuerySchema.parse(req.query);
      const entries = await meetings.getCalendar(actor(req), query);

      res.status(200).json({ data: entries });
    }),
  );

  router.get(
    '/meetings/overlap',
    ...session,
    asyncHandler(async (req, res) => {
      const query = meetingOverlapQuerySchema.parse(req.query);
      const overlaps = await meetings.checkOverlap(actor(req), query);

      res.status(200).json({ data: overlaps });
    }),
  );

  router.get(
    '/meetings/:meetingId',
    ...session,
    asyncHandler(async (req, res) => {
      const meeting = await meetings.getMeeting(
        actor(req),
        pathParam(req.params.meetingId, 'meeting'),
      );

      if (!meeting) {
        throw notFoundError('Meeting not found');
      }

      res.status(200).json({ data: meeting });
    }),
  );

  router.get(
    '/meetings/:meetingId/history',
    ...session,
    asyncHandler(async (req, res) => {
      const history = await meetings.listScheduleHistory(
        actor(req),
        pathParam(req.params.meetingId, 'meeting'),
      );

      res.status(200).json({ data: history });
    }),
  );

  router.patch(
    '/meetings/:meetingId',
    ...session,
    asyncHandler(async (req, res) => {
      const input = updateMeetingInputSchema.parse(req.body);
      const updated = await meetings.updateMeeting(
        actor(req),
        pathParam(req.params.meetingId, 'meeting'),
        input,
      );

      res.status(200).json({ data: updated });
    }),
  );

  router.post(
    '/meetings/:meetingId/reschedule',
    ...session,
    asyncHandler(async (req, res) => {
      const input = rescheduleMeetingInputSchema.parse(req.body);
      const updated = await meetings.rescheduleMeeting(
        actor(req),
        pathParam(req.params.meetingId, 'meeting'),
        input,
      );

      res.status(200).json({ data: updated });
    }),
  );

  router.post(
    '/meetings/:meetingId/cancel',
    ...session,
    asyncHandler(async (req, res) => {
      const input = cancelMeetingInputSchema.parse(req.body);
      const updated = await meetings.cancelMeeting(
        actor(req),
        pathParam(req.params.meetingId, 'meeting'),
        input,
      );

      res.status(200).json({ data: updated });
    }),
  );

  router.post(
    '/meetings/:meetingId/complete',
    ...session,
    asyncHandler(async (req, res) => {
      const input = completeMeetingInputSchema.parse(req.body ?? {});
      const updated = await meetings.completeMeeting(
        actor(req),
        pathParam(req.params.meetingId, 'meeting'),
        input,
      );

      res.status(200).json({ data: updated });
    }),
  );

  router.get(
    '/meetings/:meetingId/action-items',
    ...session,
    asyncHandler(async (req, res) => {
      const items = await meetings.listActionItems(
        actor(req),
        pathParam(req.params.meetingId, 'meeting'),
      );

      res.status(200).json({ data: items });
    }),
  );

  router.post(
    '/meetings/:meetingId/action-items',
    ...session,
    asyncHandler(async (req, res) => {
      const input = createMeetingActionItemInputSchema.parse(req.body);
      const created = await meetings.createActionItem(
        actor(req),
        pathParam(req.params.meetingId, 'meeting'),
        input,
      );

      res.status(201).json({ data: created });
    }),
  );

  router.patch(
    '/meetings/:meetingId/action-items/:actionItemId',
    ...session,
    asyncHandler(async (req, res) => {
      const input = updateMeetingActionItemInputSchema.parse(req.body);
      const updated = await meetings.updateActionItem(
        actor(req),
        pathParam(req.params.meetingId, 'meeting'),
        pathParam(req.params.actionItemId, 'action item'),
        input,
      );

      res.status(200).json({ data: updated });
    }),
  );

  router.delete(
    '/meetings/:meetingId/action-items/:actionItemId',
    ...session,
    asyncHandler(async (req, res) => {
      await meetings.deleteActionItem(
        actor(req),
        pathParam(req.params.meetingId, 'meeting'),
        pathParam(req.params.actionItemId, 'action item'),
      );

      res.status(204).send();
    }),
  );

  router.post(
    '/meetings/:meetingId/action-items/:actionItemId/create-task',
    ...session,
    asyncHandler(async (req, res) => {
      const input = convertMeetingActionItemInputSchema.parse(req.body ?? {});
      const result = await meetings.convertActionItem(
        actor(req),
        pathParam(req.params.meetingId, 'meeting'),
        pathParam(req.params.actionItemId, 'action item'),
        input,
      );

      res.status(result.created ? 201 : 200).json({ data: result });
    }),
  );

  router.get(
    '/clients/:clientId/meetings',
    ...session,
    asyncHandler(async (req, res) => {
      const query = meetingListQuerySchema.parse(req.query);
      const page = await meetings.listClientMeetings(
        actor(req),
        pathParam(req.params.clientId, 'client'),
        query,
      );

      res.status(200).json({ data: page.data, page: { nextCursor: page.nextCursor } });
    }),
  );

  router.get(
    '/projects/:projectId/meetings',
    ...session,
    asyncHandler(async (req, res) => {
      const query = meetingListQuerySchema.parse(req.query);
      const page = await meetings.listProjectMeetings(
        actor(req),
        pathParam(req.params.projectId, 'project'),
        query,
      );

      res.status(200).json({ data: page.data, page: { nextCursor: page.nextCursor } });
    }),
  );

  router.get(
    '/me/meetings',
    ...session,
    asyncHandler(async (req, res) => {
      const query = meetingListQuerySchema.parse(req.query);
      const page = await meetings.listMyMeetings(actor(req), query);

      res.status(200).json({ data: page.data, page: { nextCursor: page.nextCursor } });
    }),
  );

  return router;
}
