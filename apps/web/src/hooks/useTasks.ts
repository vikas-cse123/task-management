import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateSubtaskInput, CreateTaskInput, UpdateTaskInput } from '@interscale/shared';
import {
  addDependency,
  assignTask,
  createSubtask,
  createTask,
  getBlockers,
  getDashboardSummary,
  getTask,
  listApprovalQueue,
  listDependents,
  listMyTasks,
  listPrerequisites,
  listProjectTasks,
  listReviews,
  listSubtasks,
  listTaskActivity,
  listTasks,
  previewAssignment,
  removeDependency,
  resolveAssignment,
  resolveReview,
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

function dependencyKeys(id: string) {
  return [
    ['tasks', id, 'dependencies'],
    ['tasks', id, 'dependents'],
    ['tasks', id, 'blockers'],
    ['tasks', id, 'reviews'],
  ] as const;
}

function invalidateGraph(queryClient: ReturnType<typeof useQueryClient>, id: string) {
  invalidateTask(queryClient, id);

  for (const key of dependencyKeys(id)) {
    void queryClient.invalidateQueries({ queryKey: key });
  }

  void queryClient.invalidateQueries({ queryKey: ['my-tasks'] });
  void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
}

export function usePrerequisites(id: string | undefined) {
  return useQuery({
    queryKey: id ? ['tasks', id, 'dependencies'] : ['tasks', 'missing', 'dependencies'],
    queryFn: () => listPrerequisites(id ?? ''),
    enabled: Boolean(id),
    retry: false,
  });
}

export function useDependents(id: string | undefined) {
  return useQuery({
    queryKey: id ? ['tasks', id, 'dependents'] : ['tasks', 'missing', 'dependents'],
    queryFn: () => listDependents(id ?? ''),
    enabled: Boolean(id),
    retry: false,
  });
}

export function useBlockers(id: string | undefined) {
  return useQuery({
    queryKey: id ? ['tasks', id, 'blockers'] : ['tasks', 'missing', 'blockers'],
    queryFn: () => getBlockers(id ?? ''),
    enabled: Boolean(id),
    retry: false,
  });
}

export function useReviews(id: string | undefined) {
  return useQuery({
    queryKey: id ? ['tasks', id, 'reviews'] : ['tasks', 'missing', 'reviews'],
    queryFn: () => listReviews(id ?? ''),
    enabled: Boolean(id),
    retry: false,
  });
}

export function useAddDependency(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (predecessorTaskId: string) => addDependency(id, predecessorTaskId),
    onSuccess: () => invalidateGraph(queryClient, id),
  });
}

export function useRemoveDependency(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ dependencyId, reason }: { dependencyId: string; reason: string }) =>
      removeDependency(id, dependencyId, reason),
    onSuccess: () => invalidateGraph(queryClient, id),
  });
}

export function useResolveReview(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ reviewId, note }: { reviewId: string; note: string }) =>
      resolveReview(id, reviewId, note),
    onSuccess: () => invalidateGraph(queryClient, id),
  });
}

export function useAssignmentCandidate(id: string | undefined) {
  return useQuery({
    queryKey: id ? ['tasks', id, 'assignment', 'candidate'] : ['tasks', 'missing', 'candidate'],
    queryFn: () => previewAssignment(id ?? ''),
    enabled: Boolean(id),
    retry: false,
  });
}

export function useResolveAssignment(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => resolveAssignment(id),
    onSuccess: () => invalidateGraph(queryClient, id),
  });
}
