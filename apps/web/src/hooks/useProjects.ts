import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  ChangeProjectStatusInput,
  CreateProjectInput,
  UpdateProjectInput,
} from '@interscale/shared';
import {
  changeProjectStatus,
  createProject,
  getProject,
  listClientProjects,
  listProjectActivity,
  listProjectReviews,
  listProjects,
  updateProject,
  type ProjectFilters,
} from '../lib/projects-api';

const PROJECTS_KEY = ['projects'] as const;

function detailKey(id: string) {
  return ['projects', id] as const;
}

function activityKey(id: string) {
  return ['projects', id, 'activity'] as const;
}

function clientProjectsKey(clientId: string) {
  return ['clients', clientId, 'projects'] as const;
}

export function useProjects(filters: ProjectFilters = {}, enabled = true) {
  const { search, status, type, clientId } = filters;

  return useQuery({
    queryKey: [
      ...PROJECTS_KEY,
      { search: search ?? '', status: status ?? '', type: type ?? '', clientId: clientId ?? '' },
    ],
    queryFn: () => listProjects(filters),
    enabled,
    retry: false,
  });
}

export function useClientProjects(clientId: string | undefined) {
  return useQuery({
    queryKey: clientId ? clientProjectsKey(clientId) : ['clients', 'missing', 'projects'],
    queryFn: () => listClientProjects(clientId ?? ''),
    enabled: Boolean(clientId),
    retry: false,
  });
}

export function useProject(id: string | undefined) {
  return useQuery({
    queryKey: id ? detailKey(id) : ['projects', 'missing'],
    queryFn: () => getProject(id ?? ''),
    enabled: Boolean(id),
    retry: false,
  });
}

export function useProjectActivity(id: string | undefined) {
  return useQuery({
    queryKey: id ? activityKey(id) : ['projects', 'missing', 'activity'],
    queryFn: () => listProjectActivity(id ?? ''),
    enabled: Boolean(id),
    retry: false,
  });
}

export function useProjectReviews(projectId: string | undefined) {
  return useQuery({
    queryKey: projectId ? ['projects', projectId, 'reviews'] : ['projects', 'missing', 'reviews'],
    queryFn: () => listProjectReviews(projectId ?? ''),
    enabled: Boolean(projectId),
    retry: false,
  });
}

function invalidateProject(queryClient: ReturnType<typeof useQueryClient>, id?: string) {
  void queryClient.invalidateQueries({ queryKey: PROJECTS_KEY });

  if (id) {
    void queryClient.invalidateQueries({ queryKey: detailKey(id) });
    void queryClient.invalidateQueries({ queryKey: activityKey(id) });
  }
}

export function useCreateProject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateProjectInput) => createProject(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: PROJECTS_KEY }),
  });
}

export function useUpdateProject(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: UpdateProjectInput) => updateProject(id, input),
    onSuccess: () => invalidateProject(queryClient, id),
  });
}

export function useChangeProjectStatus(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: ChangeProjectStatusInput) => changeProjectStatus(id, input),
    onSuccess: () => invalidateProject(queryClient, id),
  });
}
