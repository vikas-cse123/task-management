import {
  assignTaskInputSchema,
  createDependencyInputSchema,
  createSubtaskInputSchema,
  createTaskInputSchema,
  removeDependencyInputSchema,
  resolveReviewInputSchema,
  taskActionInputSchema,
  taskActionReasonInputSchema,
  taskListQuerySchema,
  updateTaskInputSchema,
  type UserProfile,
} from '@interscale/shared';
import { Router } from 'express';
import type { Auth } from '../auth/auth';
import { requireActiveSession } from '../auth/middleware';
import { asyncHandler } from '../lib/async-handler';
import { notFoundError, pathParam, unauthorizedError } from '../lib/http';
import type { ProjectService } from '../services/projects';
import type { TaskService } from '../services/tasks';

/**
 * Task management (Steps 8–10).
 *
 * Mounted at the API root so both `/projects/:projectId/tasks` and
 * `/tasks/*` paths live in one router. Every route requires a valid, active
 * session that has cleared the forced password change; scope and role guards
 * live in the services so out-of-scope access returns 404.
 */
export function createTasksRouter(
  auth: Auth,
  tasks: TaskService,
  projects?: ProjectService,
): Router {
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
    '/projects/:projectId/tasks',
    ...session,
    asyncHandler(async (req, res) => {
      const projectId = pathParam(req.params.projectId, 'project');

      if (projects) {
        const project = await projects.getProject(actor(req), projectId);

        if (!project) {
          throw notFoundError('Project not found');
        }
      }

      const query = taskListQuerySchema.parse({ ...req.query, projectId });
      const page = await tasks.listTasks(actor(req), query);

      res.status(200).json({ data: page.data, page: { nextCursor: page.nextCursor } });
    }),
  );

  router.post(
    '/projects/:projectId/tasks',
    ...session,
    asyncHandler(async (req, res) => {
      const projectId = pathParam(req.params.projectId, 'project');
      const input = createTaskInputSchema.parse({ ...req.body, projectId });
      const created = await tasks.createTask(actor(req), input);

      res.status(201).json({ data: created });
    }),
  );

  router.get(
    '/tasks',
    ...session,
    asyncHandler(async (req, res) => {
      const query = taskListQuerySchema.parse(req.query);
      const page = await tasks.listTasks(actor(req), query);

      res.status(200).json({ data: page.data, page: { nextCursor: page.nextCursor } });
    }),
  );

  router.get(
    '/tasks/:id',
    ...session,
    asyncHandler(async (req, res) => {
      const task = await tasks.getTask(actor(req), pathParam(req.params.id, 'task'));

      if (!task) {
        throw notFoundError('Task not found');
      }

      res.status(200).json({ data: task });
    }),
  );

  router.patch(
    '/tasks/:id',
    ...session,
    asyncHandler(async (req, res) => {
      const input = updateTaskInputSchema.parse(req.body);
      const task = await tasks.updateTask(actor(req), pathParam(req.params.id, 'task'), input);

      res.status(200).json({ data: task });
    }),
  );

  router.patch(
    '/tasks/:id/assignment',
    ...session,
    asyncHandler(async (req, res) => {
      const input = assignTaskInputSchema.parse(req.body);
      const task = await tasks.assignTask(actor(req), pathParam(req.params.id, 'task'), input);

      res.status(200).json({ data: task });
    }),
  );

  router.get(
    '/tasks/:id/activity',
    ...session,
    asyncHandler(async (req, res) => {
      const activity = await tasks.listTaskActivity(actor(req), pathParam(req.params.id, 'task'));

      res.status(200).json({ data: activity });
    }),
  );

  router.get(
    '/tasks/:id/subtasks',
    ...session,
    asyncHandler(async (req, res) => {
      const subtasks = await tasks.listSubtasks(actor(req), pathParam(req.params.id, 'task'));

      res.status(200).json({ data: subtasks });
    }),
  );

  router.post(
    '/tasks/:id/subtasks',
    ...session,
    asyncHandler(async (req, res) => {
      const input = createSubtaskInputSchema.parse(req.body);
      const result = await tasks.createSubtask(
        actor(req),
        pathParam(req.params.id, 'parent task'),
        input,
      );

      res.status(201).json({ data: { task: result.task, warnings: result.warnings } });
    }),
  );

  router.get(
    '/my-tasks',
    ...session,
    asyncHandler(async (req, res) => {
      const query = taskListQuerySchema.parse(req.query);
      const page = await tasks.listMyTasks(actor(req), query);

      res.status(200).json({ data: page.data, page: { nextCursor: page.nextCursor } });
    }),
  );

  router.get(
    '/approvals/queue',
    ...session,
    asyncHandler(async (req, res) => {
      const limit = Math.max(1, Math.min(100, Number(req.query['limit'] ?? 50) || 50));
      const page = await tasks.listApprovalQueue(actor(req), limit);

      res.status(200).json({ data: page.data, page: { nextCursor: page.nextCursor } });
    }),
  );

  function flow(
    action:
      | 'start'
      | 'submit'
      | 'approve'
      | 'revise'
      | 'complete'
      | 'cancel'
      | 'block'
      | 'unblock'
      | 'reopen',
    requiresReason: boolean,
  ) {
    return asyncHandler(async (req, res) => {
      const profile = actor(req);
      const id = pathParam(req.params.id, 'task');

      if (requiresReason) {
        const input = taskActionReasonInputSchema.parse(req.body ?? {});
        const reason = input.reason;

        if (action === 'revise') {
          res.status(200).json({ data: await tasks.reviseTask(profile, id, reason, input) });
          return;
        }

        if (action === 'cancel') {
          res.status(200).json({ data: await tasks.cancelTask(profile, id, reason, input) });
          return;
        }

        if (action === 'block') {
          res.status(200).json({ data: await tasks.blockTask(profile, id, reason, input) });
          return;
        }

        if (action === 'unblock') {
          res.status(200).json({ data: await tasks.unblockTask(profile, id, reason, input) });
          return;
        }

        res.status(200).json({ data: await tasks.reopenTask(profile, id, reason, input) });
        return;
      }

      const input = taskActionInputSchema.parse(req.body ?? {});

      if (action === 'start') {
        res.status(200).json({ data: await tasks.startTask(profile, id, input) });
        return;
      }

      if (action === 'submit') {
        res.status(200).json({ data: await tasks.submitTask(profile, id, input) });
        return;
      }

      if (action === 'approve') {
        res.status(200).json({ data: await tasks.approveTask(profile, id, input) });
        return;
      }

      res.status(200).json({ data: await tasks.completeTask(profile, id, input) });
    });
  }

  router.post('/tasks/:id/start', ...session, flow('start', false));
  router.post('/tasks/:id/submit', ...session, flow('submit', false));
  router.post('/tasks/:id/approve', ...session, flow('approve', false));
  router.post('/tasks/:id/revise', ...session, flow('revise', true));
  router.post('/tasks/:id/complete', ...session, flow('complete', false));
  router.post('/tasks/:id/cancel', ...session, flow('cancel', true));
  router.post('/tasks/:id/block', ...session, flow('block', true));
  router.post('/tasks/:id/unblock', ...session, flow('unblock', true));
  router.post('/tasks/:id/reopen', ...session, flow('reopen', true));

  router.get(
    '/tasks/:id/dependencies',
    ...session,
    asyncHandler(async (req, res) => {
      const links = await tasks.listPrerequisites(actor(req), pathParam(req.params.id, 'task'));

      res.status(200).json({ data: links });
    }),
  );

  router.post(
    '/tasks/:id/dependencies',
    ...session,
    asyncHandler(async (req, res) => {
      const input = createDependencyInputSchema.parse(req.body);
      const edge = await tasks.createDependency(
        actor(req),
        pathParam(req.params.id, 'task'),
        input,
      );

      res.status(201).json({ data: edge });
    }),
  );

  router.get(
    '/tasks/:id/dependents',
    ...session,
    asyncHandler(async (req, res) => {
      const links = await tasks.listDependents(actor(req), pathParam(req.params.id, 'task'));

      res.status(200).json({ data: links });
    }),
  );

  router.delete(
    '/tasks/:id/dependencies/:dependencyId',
    ...session,
    asyncHandler(async (req, res) => {
      const input = removeDependencyInputSchema.parse(req.body ?? {});
      const result = await tasks.removeDependency(
        actor(req),
        pathParam(req.params.id, 'task'),
        pathParam(req.params.dependencyId, 'dependency'),
        input,
      );

      res.status(200).json({ data: result });
    }),
  );

  router.get(
    '/tasks/:id/blockers',
    ...session,
    asyncHandler(async (req, res) => {
      const blockers = await tasks.getBlockers(actor(req), pathParam(req.params.id, 'task'));

      res.status(200).json({ data: blockers });
    }),
  );

  router.get(
    '/tasks/:id/reviews',
    ...session,
    asyncHandler(async (req, res) => {
      const reviews = await tasks.listReviews(actor(req), pathParam(req.params.id, 'task'));

      res.status(200).json({ data: reviews });
    }),
  );

  router.post(
    '/tasks/:id/reviews/:reviewId/resolve',
    ...session,
    asyncHandler(async (req, res) => {
      const input = resolveReviewInputSchema.parse(req.body ?? {});
      const review = await tasks.resolveReview(
        actor(req),
        pathParam(req.params.id, 'task'),
        pathParam(req.params.reviewId, 'review'),
        input.note,
      );

      res.status(200).json({ data: review });
    }),
  );

  router.get(
    '/tasks/:id/assignment/candidate',
    ...session,
    asyncHandler(async (req, res) => {
      const decision = await tasks.previewAssignment(actor(req), pathParam(req.params.id, 'task'));

      res.status(200).json({ data: decision });
    }),
  );

  router.post(
    '/tasks/:id/assignment/resolve',
    ...session,
    asyncHandler(async (req, res) => {
      const task = await tasks.resolveAssignment(actor(req), pathParam(req.params.id, 'task'));

      res.status(200).json({ data: task });
    }),
  );

  return router;
}
