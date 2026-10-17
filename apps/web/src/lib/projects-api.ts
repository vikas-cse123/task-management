import {
  API_PREFIX,
  auditEntrySchema,
  dependencyReviewSchema,
  projectDetailSchema,
  projectSummarySchema,
  type AuditEntry,
  type ChangeProjectStatusInput,
  type CreateProjectInput,
  type DependencyReview,
  type ProjectDetail,
  type ProjectSummary,
  type UpdateProjectInput,
} from '@interscale/shared';
import { apiRequest } from './api';

/** Project management client (Step 7). */

export interface ProjectFilters {
  search?: string;
  status?: string;
  type?: string;
  clientId?: string;
}

export async function listProjects(filters: ProjectFilters = {}): Promise<ProjectSummary[]> {
  const params = new URLSearchParams({ limit: '100' });

  if (filters.search && filters.search.trim().length > 0) {
    params.set('search', filters.search.trim());
  }

  if (filters.status) {
    params.set('status', filters.status);
  }

  if (filters.type) {
    params.set('type', filters.type);
  }

  if (filters.clientId) {
    params.set('clientId', filters.clientId);
  }

  const data = await apiRequest<unknown>(`${API_PREFIX}/projects?${params.toString()}`);
  return projectSummarySchema.array().parse(data);
}

export async function listClientProjects(clientId: string): Promise<ProjectSummary[]> {
  const data = await apiRequest<unknown>(`${API_PREFIX}/clients/${clientId}/projects?limit=100`);
  return projectSummarySchema.array().parse(data);
}

export async function getProject(id: string): Promise<ProjectDetail> {
  const data = await apiRequest<unknown>(`${API_PREFIX}/projects/${id}`);
  return projectDetailSchema.parse(data);
}

export async function createProject(input: CreateProjectInput): Promise<ProjectSummary> {
  const data = await apiRequest<unknown>(`${API_PREFIX}/projects`, {
    method: 'POST',
    body: JSON.stringify(input),
  });

  return projectSummarySchema.parse(data);
}

export async function updateProject(
  id: string,
  input: UpdateProjectInput,
): Promise<ProjectSummary> {
  const data = await apiRequest<unknown>(`${API_PREFIX}/projects/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });

  return projectSummarySchema.parse(data);
}

export async function changeProjectStatus(
  id: string,
  input: ChangeProjectStatusInput,
): Promise<ProjectSummary> {
  const data = await apiRequest<unknown>(`${API_PREFIX}/projects/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });

  return projectSummarySchema.parse(data);
}

export async function listProjectActivity(id: string): Promise<AuditEntry[]> {
  const data = await apiRequest<unknown>(`${API_PREFIX}/projects/${id}/activity`);
  return auditEntrySchema.array().parse(data);
}

export async function listProjectReviews(projectId: string): Promise<DependencyReview[]> {
  const data = await apiRequest<unknown>(`${API_PREFIX}/projects/${projectId}/reviews`);
  return dependencyReviewSchema.array().parse(data);
}
