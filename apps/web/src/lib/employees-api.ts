import {
  API_PREFIX,
  departmentSchema,
  employeeCreatedSchema,
  jobRoleSchema,
  userProfileSchema,
  type CreateEmployeeInput,
  type Department,
  type EmployeeCreated,
  type JobRole,
  type UpdateEmployeeInput,
  type UpdateReferenceLabel,
  type UserProfile,
} from '@interscale/shared';
import { apiRequest } from './api';

/** Admin-only employee administration client (Step 4). */

export async function listEmployees(): Promise<UserProfile[]> {
  const data = await apiRequest<unknown>(`${API_PREFIX}/users?limit=100`);
  return userProfileSchema.array().parse(data);
}

export async function createEmployee(input: CreateEmployeeInput): Promise<EmployeeCreated> {
  const data = await apiRequest<unknown>(`${API_PREFIX}/users`, {
    method: 'POST',
    body: JSON.stringify(input),
  });

  return employeeCreatedSchema.parse(data);
}

export async function updateEmployee(id: string, input: UpdateEmployeeInput): Promise<UserProfile> {
  const data = await apiRequest<unknown>(`${API_PREFIX}/users/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });

  return userProfileSchema.parse(data);
}

export async function revokeEmployeeSessions(id: string): Promise<number> {
  const data = await apiRequest<{ revoked: number }>(`${API_PREFIX}/users/${id}/sessions/revoke`, {
    method: 'POST',
  });

  return data.revoked;
}

export async function listDepartments(): Promise<Department[]> {
  const data = await apiRequest<unknown>(`${API_PREFIX}/reference-data/departments`);
  return departmentSchema.array().parse(data);
}

export async function listJobRoles(): Promise<JobRole[]> {
  const data = await apiRequest<unknown>(`${API_PREFIX}/reference-data/job-roles`);
  return jobRoleSchema.array().parse(data);
}

export async function updateDepartment(
  id: string,
  patch: UpdateReferenceLabel,
): Promise<Department> {
  const data = await apiRequest<unknown>(`${API_PREFIX}/reference-data/departments/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });

  return departmentSchema.parse(data);
}

export async function updateJobRole(id: string, patch: UpdateReferenceLabel): Promise<JobRole> {
  const data = await apiRequest<unknown>(`${API_PREFIX}/reference-data/job-roles/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });

  return jobRoleSchema.parse(data);
}
