import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateSubtaskInput, CreateTaskInput, UpdateTaskInput } from '@interscale/shared';
import {
  assignTask,
  createSubtask,
  createTask,
  getDashboardSummary,
  getTask,
  listApprovalQueue,
  listMyTasks,
  listProjectTasks,
  listSubtasks,
  listTaskActivity,
  listTasks,
  taskFlow,
  updateTask,
  type MyTasksFilters,
  type TaskFilters,
} from '../lib/tasks-api';

const TASKS_KEY = ['tasks'] as const;

function detailKey(id: string) {
  return ['tasks', id] as const;
}

function subtasksKey(id: string) {
  return ['tasks', id, 'subtasks'] as const;
}

function activityKey(id: string) {
  return ['tasks', id, 'activity'] as const;
}

export function useTasks(filters: TaskFilters = {}, enabled = true) {
  const { search, status, priority, projectId } = filters;

  return useQuery({
    queryKey: [
      ...TASKS_KEY,
      {
        search: search ?? '',
        status: status ?? '',
        priority: priority ?? '',
        projectId: projectId ?? '',
      },
    ],
    queryFn: () => listTasks(filters),
    enabled,
    retry: false,
  });
}

export function useProjectTasks(projectId: string | undefined) {
  return useQuery({
    queryKey: projectId ? ['projects', projectId, 'tasks'] : ['projects', 'missing', 'tasks'],
    queryFn: () => listProjectTasks(projectId ?? ''),
    enabled: Boolean(projectId),
    retry: false,
  });
}

export function useTask(id: string | undefined) {
  return useQuery({
    queryKey: id ? detailKey(id) : ['tasks', 'missing'],
    queryFn: () => getTask(id ?? ''),
    enabled: Boolean(id),
    retry: false,
  });
}

export function useSubtasks(parentId: string | undefined) {
  return useQuery({
    queryKey: parentId ? subtasksKey(parentId) : ['tasks', 'missing', 'subtasks'],
    queryFn: () => listSubtasks(parentId ?? ''),
    enabled: Boolean(parentId),
    retry: false,
  });
}

export function useTaskActivity(id: string | undefined) {
  return useQuery({
    queryKey: id ? activityKey(id) : ['tasks', 'missing', 'activity'],
    queryFn: () => listTaskActivity(id ?? ''),
    enabled: Boolean(id),
    retry: false,
  });
}

function invalidateTask(queryClient: ReturnType<typeof useQueryClient>, id: string) {
  void queryClient.invalidateQueries({ queryKey: TASKS_KEY });
  void queryClient.invalidateQueries({ queryKey: detailKey(id) });
  void queryClient.invalidateQueries({ queryKey: subtasksKey(id) });
  void queryClient.invalidateQueries({ queryKey: activityKey(id) });
  void queryClient.invalidateQueries({ queryKey: ['projects'] });
}

export function useCreateTask(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateTaskInput) => createTask(projectId, input),
    onSuccess: () => invalidateTask(queryClient, projectId),
  });
}

export function useUpdateTask(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: UpdateTaskInput) => updateTask(id, input),
    onSuccess: () => invalidateTask(queryClient, id),
  });
}

export function useAssignTask(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { assignedUserId: string | null; assignedJobRoleId: string | null }) =>
      assignTask(id, input),
    onSuccess: () => invalidateTask(queryClient, id),
  });
}

export function useCreateSubtask(parentId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateSubtaskInput) => createSubtask(parentId, input),
    onSuccess: () => invalidateTask(queryClient, parentId),
  });
}

export function useTaskFlow(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      action,
      reason,
      note,
    }: {
      action:
        | 'start'
        | 'submit'
        | 'approve'
        | 'complete'
        | 'revise'
        | 'cancel'
        | 'block'
        | 'unblock'
        | 'reopen';
      reason?: string;
      note?: string;
    }) => taskFlow(id, action, { reason, note }),
    onSuccess: () => {
      invalidateTask(queryClient, id);
      void queryClient.invalidateQueries({ queryKey: ['my-tasks'] });
      void queryClient.invalidateQueries({ queryKey: ['approvals'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export function useMyTasks(filters: MyTasksFilters = {}, enabled = true) {
  return useQuery({
    queryKey: ['my-tasks', filters],
    queryFn: () => listMyTasks(filters),
    enabled,
    retry: false,
  });
}

export function useApprovalQueue(enabled = true) {
  return useQuery({
    queryKey: ['approvals', 'queue'],
    queryFn: listApprovalQueue,
    enabled,
    retry: false,
  });
}

export function useDashboardSummary(enabled = true) {
  return useQuery({
    queryKey: ['dashboard', 'summary'],
    queryFn: getDashboardSummary,
    enabled,
    retry: false,
  });
}
