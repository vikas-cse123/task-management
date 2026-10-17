import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreateEmployeeInput,
  UpdateEmployeeInput,
  UpdateReferenceLabel,
} from '@interscale/shared';
import {
  createEmployee,
  listDepartments,
  listEmployees,
  listJobRoles,
  revokeEmployeeSessions,
  updateDepartment,
  updateEmployee,
  updateJobRole,
} from '../lib/employees-api';

const EMPLOYEES_KEY = ['employees'] as const;
const DEPARTMENTS_KEY = ['reference-data', 'departments'] as const;
const JOB_ROLES_KEY = ['reference-data', 'job-roles'] as const;

export function useEmployees(enabled = true) {
  return useQuery({ queryKey: EMPLOYEES_KEY, queryFn: listEmployees, enabled, retry: false });
}

export function useDepartments() {
  return useQuery({ queryKey: DEPARTMENTS_KEY, queryFn: listDepartments, retry: false });
}

export function useJobRoles() {
  return useQuery({ queryKey: JOB_ROLES_KEY, queryFn: listJobRoles, retry: false });
}

export function useCreateEmployee() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateEmployeeInput) => createEmployee(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: EMPLOYEES_KEY }),
  });
}

export function useUpdateEmployee() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateEmployeeInput }) =>
      updateEmployee(id, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: EMPLOYEES_KEY }),
  });
}

export function useRevokeEmployeeSessions() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => revokeEmployeeSessions(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: EMPLOYEES_KEY }),
  });
}

export function useUpdateDepartment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: UpdateReferenceLabel }) =>
      updateDepartment(id, patch),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: DEPARTMENTS_KEY }),
  });
}

export function useUpdateJobRole() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: UpdateReferenceLabel }) =>
      updateJobRole(id, patch),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: JOB_ROLES_KEY }),
  });
}
