import {
  approveTask as dbApproveTask,
  assignTaskRecord,
  blockTask as dbBlockTask,
  canReadTask,
  cancelTask as dbCancelTask,
  completeTask as dbCompleteTask,
  createSubtaskRecord,
  createTaskRecord,
  findProject,
  findTask,
  findTaskDetail,
  isActiveClientMember,
  listActiveClientIdsForUser,
  listApprovalQueue as dbListApprovalQueue,
  listMyTasks as dbListMyTasks,
  listSubtasks as dbListSubtasks,
  listTaskActivity as dbListTaskActivity,
  listTasks as dbListTasks,
  MongoEmployeeDirectory,
  reopenTask as dbReopenTask,
  reviseTask as dbReviseTask,
  startTask as dbStartTask,
  submitTask as dbSubmitTask,
  unblockTask as dbUnblockTask,
  updateTaskRecord,
  type EmployeeDirectory,
  type TaskServiceDeps,
} from '@interscale/db';
import { NotFoundError } from '@interscale/db';
import type {
  AssignTaskInput,
  CreateSubtaskInput,
  CreateTaskInput,
  TaskActionInput,
  TaskActivity,
  TaskDetail,
  TaskListQuery,
  TaskRow,
  TaskSummary,
  UpdateTaskInput,
  UserProfile,
} from '@interscale/shared';
import { forbiddenError } from '../lib/http';

/**
 * Task orchestration (Steps 8–10).
 *
 * Scope rules (docs/03-authorization.md, permission matrix §5):
 * - Admins manage everything; task creation is Admin or in-scope Manager.
 * - Managers read tasks under member clients; employees read only assigned
 *   work (plus parent context for their subtasks). Out-of-scope → 404.
 * - Assignees may start/submit/complete their own work and edit its
 *   description/due date; every other mutation needs Admin or in-scope
 *   Manager. Status flows run through the transition engine (Step 10).
 */

export interface TaskPage {
  readonly data: TaskSummary[];
  readonly nextCursor: string | null;
}

export interface TaskService {
  listTasks(actor: UserProfile, query: TaskListQuery): Promise<TaskPage>;
  getTask(actor: UserProfile, id: string): Promise<TaskDetail | null>;
  createTask(actor: UserProfile, input: CreateTaskInput): Promise<TaskSummary>;
  updateTask(actor: UserProfile, id: string, input: UpdateTaskInput): Promise<TaskSummary>;
  assignTask(actor: UserProfile, id: string, input: AssignTaskInput): Promise<TaskSummary>;
  createSubtask(
    actor: UserProfile,
    parentId: string,
    input: CreateSubtaskInput,
  ): Promise<{ task: TaskSummary; warnings: string[] }>;
  listSubtasks(actor: UserProfile, parentId: string): Promise<TaskSummary[]>;
  listTaskActivity(actor: UserProfile, id: string): Promise<TaskActivity[]>;
  startTask(actor: UserProfile, id: string, input: TaskActionInput): Promise<TaskSummary>;
  submitTask(actor: UserProfile, id: string, input: TaskActionInput): Promise<TaskSummary>;
  approveTask(actor: UserProfile, id: string, input: TaskActionInput): Promise<TaskSummary>;
  reviseTask(
    actor: UserProfile,
    id: string,
    reason: string,
    input: TaskActionInput,
  ): Promise<TaskSummary>;
  completeTask(actor: UserProfile, id: string, input: TaskActionInput): Promise<TaskSummary>;
  cancelTask(
    actor: UserProfile,
    id: string,
    reason: string,
    input: TaskActionInput,
  ): Promise<TaskSummary>;
  blockTask(
    actor: UserProfile,
    id: string,
    reason: string,
    input: TaskActionInput,
  ): Promise<TaskSummary>;
  unblockTask(
    actor: UserProfile,
    id: string,
    reason: string,
    input: TaskActionInput,
  ): Promise<TaskSummary>;
  reopenTask(
    actor: UserProfile,
    id: string,
    reason: string,
    input: TaskActionInput,
  ): Promise<TaskSummary>;
  listMyTasks(actor: UserProfile, query: TaskListQuery): Promise<TaskRowPage>;
  listApprovalQueue(actor: UserProfile, limit: number): Promise<TaskRowPage>;
}

export interface TaskRowPage {
  readonly data: TaskRow[];
  readonly nextCursor: string | null;
}

function isAdmin(actor: UserProfile): boolean {
  return actor.accessLevel === 'Admin';
}

function isManager(actor: UserProfile): boolean {
  return actor.accessLevel === 'Manager';
}

export function createTaskService(
  directory: EmployeeDirectory = new MongoEmployeeDirectory(),
): TaskService {
  const deps: TaskServiceDeps = { directory };

  async function projectClientId(projectId: string): Promise<string> {
    const project = await findProject(projectId);

    if (!project) {
      throw new NotFoundError('Project');
    }

    return project.clientId;
  }

  async function requireInScope(actor: UserProfile, id: string): Promise<TaskSummary> {
    const task = await findTask(id);

    if (!task) {
      throw new NotFoundError('Task');
    }

    if (isAdmin(actor)) {
      return task;
    }

    const clientId = await projectClientId(task.projectId);

    if (isManager(actor)) {
      const inScope = await isActiveClientMember(clientId, actor.id);

      if (!inScope) {
        throw new NotFoundError('Task');
      }

      return task;
    }

    const readable = await canReadTask(id, actor.id);

    if (!readable) {
      throw new NotFoundError('Task');
    }

    return task;
  }

  /** Editors: Admins and in-scope Managers (assignee self-service is separate). */
  async function requireEdit(actor: UserProfile, id: string): Promise<TaskSummary> {
    if (isAdmin(actor)) {
      const task = await findTask(id);

      if (!task) {
        throw new NotFoundError('Task');
      }

      return task;
    }

    if (isManager(actor)) {
      const task = await findTask(id);

      if (!task) {
        throw new NotFoundError('Task');
      }

      const clientId = await projectClientId(task.projectId);
      const inScope = await isActiveClientMember(clientId, actor.id);

      if (!inScope) {
        throw new NotFoundError('Task');
      }

      return task;
    }

    throw forbiddenError('Only Admins and Managers in scope can perform this action');
  }

  /** Assignees may act on their own work; everyone else needs edit rights. */
  async function requireAssigneeOrEdit(actor: UserProfile, id: string): Promise<TaskSummary> {
    const task = await findTask(id);

    if (!task) {
      throw new NotFoundError('Task');
    }

    if (task.assignedUserId === actor.id) {
      return task;
    }

    return requireEdit(actor, id);
  }

  /** Only the designated approver inside the task's scope (engine re-checks). */
  async function requireApprover(actor: UserProfile, id: string): Promise<TaskSummary> {
    const task = await findTask(id);

    if (!task) {
      throw new NotFoundError('Task');
    }

    if (task.approverId !== actor.id) {
      throw forbiddenError('Only the designated approver can review this task');
    }

    if (!isAdmin(actor)) {
      const clientId = await projectClientId(task.projectId);
      const inScope = await isActiveClientMember(clientId, actor.id);

      if (!inScope) {
        throw new NotFoundError('Task');
      }
    }

    return task;
  }

  return {
    async listTasks(actor, query) {
      const scope = isAdmin(actor)
        ? ({ kind: 'all' } as const)
        : isManager(actor)
          ? ({ kind: 'member', userId: actor.id } as const)
          : ({ kind: 'assignee', userId: actor.id } as const);

      const page = await dbListTasks(query, scope);
      return { data: page.data, nextCursor: page.nextCursor };
    },

    async getTask(actor, id) {
      try {
        await requireInScope(actor, id);
      } catch (error) {
        if (error instanceof NotFoundError) {
          return null;
        }

        throw error;
      }

      return findTaskDetail(id);
    },

    async createTask(actor, input) {
      if (isAdmin(actor)) {
        return createTaskRecord(input, actor.id, deps);
      }

      if (isManager(actor)) {
        const clientId = await projectClientId(input.projectId);
        const inScope = await isActiveClientMember(clientId, actor.id);

        if (!inScope) {
          throw new NotFoundError('Project');
        }

        return createTaskRecord(input, actor.id, deps);
      }

      throw forbiddenError('Only Admins and Managers in scope can create tasks');
    },

    async updateTask(actor, id, input) {
      const task = await findTask(id);

      if (!task) {
        throw new NotFoundError('Task');
      }

      const { expectedVersion, ...patch } = input;

      // Assignee self-service: description and due date on own work only.
      const editorKeys = Object.keys(patch);
      const selfServiceKeys = ['description', 'dueAt'];
      const isSelfService =
        editorKeys.length > 0 &&
        editorKeys.every((key) => selfServiceKeys.includes(key)) &&
        task.assignedUserId === actor.id;

      if (isSelfService) {
        return updateTaskRecord(id, patch, actor.id, deps, expectedVersion);
      }

      await requireEdit(actor, id);

      return updateTaskRecord(id, patch, actor.id, deps, expectedVersion);
    },

    async assignTask(actor, id, input) {
      await requireEdit(actor, id);
      return assignTaskRecord(
        id,
        { assignedUserId: input.assignedUserId, assignedJobRoleId: input.assignedJobRoleId },
        actor.id,
        deps,
        input.expectedVersion,
      );
    },

    async createSubtask(actor, parentId, input) {
      await requireEdit(actor, parentId);
      return createSubtaskRecord(parentId, input, actor.id, deps);
    },

    async listSubtasks(actor, parentId) {
      await requireInScope(actor, parentId);
      return dbListSubtasks(parentId);
    },

    async listTaskActivity(actor, id) {
      await requireInScope(actor, id);

      const entries = await dbListTaskActivity(id);

      return entries.map((entry) => ({
        id: entry.id,
        taskId: entry.taskId,
        actorId: entry.actorId,
        action: entry.action,
        previousValue: entry.previousValue,
        newValue: entry.newValue,
        notes: entry.notes,
        createdAt: entry.createdAt,
      }));
    },

    async startTask(actor, id, input) {
      await requireAssigneeOrEdit(actor, id);
      return dbStartTask(id, actor.id, { expectedVersion: input.expectedVersion });
    },

    async submitTask(actor, id, input) {
      await requireAssigneeOrEdit(actor, id);
      return dbSubmitTask(id, actor.id, {
        expectedVersion: input.expectedVersion,
        note: input.note ?? null,
      });
    },

    async approveTask(actor, id, input) {
      await requireApprover(actor, id);
      return dbApproveTask(id, actor.id, {
        expectedVersion: input.expectedVersion,
        note: input.note ?? null,
      });
    },

    async reviseTask(actor, id, reason, input) {
      await requireApprover(actor, id);
      return dbReviseTask(id, actor.id, reason, { expectedVersion: input.expectedVersion });
    },

    async completeTask(actor, id, input) {
      await requireAssigneeOrEdit(actor, id);
      return dbCompleteTask(id, actor.id, {
        expectedVersion: input.expectedVersion,
        note: input.note ?? null,
      });
    },

    async cancelTask(actor, id, reason, input) {
      await requireEdit(actor, id);
      return dbCancelTask(id, actor.id, reason, { expectedVersion: input.expectedVersion });
    },

    async blockTask(actor, id, reason, input) {
      await requireAssigneeOrEdit(actor, id);
      return dbBlockTask(id, actor.id, reason, { expectedVersion: input.expectedVersion });
    },

    async unblockTask(actor, id, reason, input) {
      await requireEdit(actor, id);
      return dbUnblockTask(id, actor.id, reason, { expectedVersion: input.expectedVersion });
    },

    async reopenTask(actor, id, reason, input) {
      await requireEdit(actor, id);
      return dbReopenTask(id, actor.id, reason, { expectedVersion: input.expectedVersion });
    },

    async listMyTasks(actor, query) {
      const page = await dbListMyTasks(actor.id, {
        status: query.status,
        clientId: query.clientId,
        projectId: query.projectId,
        priority: query.priority,
        due: query.due,
        search: query.search,
        limit: query.limit,
        cursor: query.cursor,
      });

      return {
        data: page.data.map((row) => ({
          ...row.task,
          projectName: row.projectName,
          clientName: row.clientName,
          clientId: row.clientId,
          parentTitle: row.parentTitle,
        })),
        nextCursor: page.nextCursor,
      };
    },

    async listApprovalQueue(actor, limit) {
      const scopeAll = isAdmin(actor);
      const memberClientIds = scopeAll ? [] : await listActiveClientIdsForUser(actor.id);

      const page = await dbListApprovalQueue(actor.id, scopeAll, memberClientIds, limit);

      return {
        data: page.data.map((row) => ({
          ...row.task,
          projectName: row.projectName,
          clientName: row.clientName,
          clientId: row.clientId,
          parentTitle: row.parentTitle,
        })),
        nextCursor: page.nextCursor,
      };
    },
  };
}
