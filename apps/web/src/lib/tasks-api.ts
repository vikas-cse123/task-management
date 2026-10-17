import {
  API_PREFIX,
  dashboardSummarySchema,
  taskActivitySchema,
  taskDetailSchema,
  taskRowSchema,
  taskSummarySchema,
  type CreateSubtaskInput,
  type CreateTaskInput,
  type DashboardSummary,
  type TaskActivity,
  type TaskDetail,
  type TaskRow,
  type TaskSummary,
  type UpdateTaskInput,
} from '@interscale/shared';
import { apiRequest } from './api';

/** Task and subtask client (Steps 8–9). */

export interface TaskFilters {
  search?: string;
  status?: string;
  priority?: string;
  projectId?: string;
}

export async function listTasks(filters: TaskFilters = {}): Promise<TaskSummary[]> {
  const params = new URLSearchParams({ limit: '100' });

  if (filters.search && filters.search.trim().length > 0) {
    params.set('search', filters.search.trim());
  }

  if (filters.status) {
    params.set('status', filters.status);
  }

  if (filters.priority) {
    params.set('priority', filters.priority);
  }

  if (filters.projectId) {
    params.set('projectId', filters.projectId);
  }

  const data = await apiRequest<unknown>(`${API_PREFIX}/tasks?${params.toString()}`);
  return taskSummarySchema.array().parse(data);
}

export async function listProjectTasks(projectId: string): Promise<TaskSummary[]> {
  const data = await apiRequest<unknown>(`${API_PREFIX}/projects/${projectId}/tasks?limit=100`);
  return taskSummarySchema.array().parse(data);
}

export async function getTask(id: string): Promise<TaskDetail> {
  const data = await apiRequest<unknown>(`${API_PREFIX}/tasks/${id}`);
  return taskDetailSchema.parse(data);
}

export async function createTask(projectId: string, input: CreateTaskInput): Promise<TaskSummary> {
  const data = await apiRequest<unknown>(`${API_PREFIX}/projects/${projectId}/tasks`, {
    method: 'POST',
    body: JSON.stringify(input),
  });

  return taskSummarySchema.parse(data);
}

export async function updateTask(id: string, input: UpdateTaskInput): Promise<TaskSummary> {
  const data = await apiRequest<unknown>(`${API_PREFIX}/tasks/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });

  return taskSummarySchema.parse(data);
}

export async function assignTask(
  id: string,
  input: { assignedUserId: string | null; assignedJobRoleId: string | null },
): Promise<TaskSummary> {
  const data = await apiRequest<unknown>(`${API_PREFIX}/tasks/${id}/assignment`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });

  return taskSummarySchema.parse(data);
}

export async function listTaskActivity(id: string): Promise<TaskActivity[]> {
  const data = await apiRequest<unknown>(`${API_PREFIX}/tasks/${id}/activity`);
  return taskActivitySchema.array().parse(data);
}

export async function listSubtasks(parentId: string): Promise<TaskSummary[]> {
  const data = await apiRequest<unknown>(`${API_PREFIX}/tasks/${parentId}/subtasks`);
  return taskSummarySchema.array().parse(data);
}

export async function createSubtask(
  parentId: string,
  input: CreateSubtaskInput,
): Promise<{ task: TaskSummary; warnings: string[] }> {
  const data = await apiRequest<{ task: unknown; warnings: string[] }>(
    `${API_PREFIX}/tasks/${parentId}/subtasks`,
    {
      method: 'POST',
      body: JSON.stringify(input),
    },
  );

  return { task: taskSummarySchema.parse(data.task), warnings: data.warnings ?? [] };
}

type FlowAction =
  | 'start'
  | 'submit'
  | 'approve'
  | 'complete'
  | 'revise'
  | 'cancel'
  | 'block'
  | 'unblock'
  | 'reopen';

export async function taskFlow(
  id: string,
  action: FlowAction,
  body: { reason?: string; note?: string } = {},
): Promise<TaskSummary> {
  const data = await apiRequest<unknown>(`${API_PREFIX}/tasks/${id}/${action}`, {
    method: 'POST',
    body: JSON.stringify(body),
  });

  return taskSummarySchema.parse(data);
}

export interface MyTasksFilters {
  status?: string;
  clientId?: string;
  projectId?: string;
  priority?: string;
  due?: 'overdue' | 'today' | 'upcoming';
  search?: string;
}

export async function listMyTasks(filters: MyTasksFilters = {}): Promise<TaskRow[]> {
  const params = new URLSearchParams({ limit: '100' });

  for (const [key, value] of Object.entries(filters)) {
    if (value && value.length > 0) {
      params.set(key, value);
    }
  }

  const data = await apiRequest<unknown>(`${API_PREFIX}/my-tasks?${params.toString()}`);
  return taskRowSchema.array().parse(data);
}

export async function listApprovalQueue(): Promise<TaskRow[]> {
  const data = await apiRequest<unknown>(`${API_PREFIX}/approvals/queue?limit=100`);
  return taskRowSchema.array().parse(data);
}

export async function getDashboardSummary(): Promise<DashboardSummary> {
  const data = await apiRequest<unknown>(`${API_PREFIX}/dashboard/summary`);
  return dashboardSummarySchema.parse(data);
}
