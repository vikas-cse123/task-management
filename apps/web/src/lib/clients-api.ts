import {
  API_PREFIX,
  clientRoleAssignmentViewSchema,
  clientSummarySchema,
  clientTeamMemberViewSchema,
  type ClientRoleAssignmentInput,
  type ClientRoleAssignmentView,
  type ClientSummary,
  type ClientTeamMemberUpdate,
  type ClientTeamMemberView,
  type CreateClientInput,
  type UpdateClientInput,
} from '@interscale/shared';
import { apiRequest } from './api';

/** Client management and client-team client (Step 5). */

export async function listClients(search?: string): Promise<ClientSummary[]> {
  const params = new URLSearchParams({ limit: '100' });

  if (search && search.trim().length > 0) {
    params.set('search', search.trim());
  }

  const data = await apiRequest<unknown>(`${API_PREFIX}/clients?${params.toString()}`);
  return clientSummarySchema.array().parse(data);
}

export async function getClient(id: string): Promise<ClientSummary> {
  const data = await apiRequest<unknown>(`${API_PREFIX}/clients/${id}`);
  return clientSummarySchema.parse(data);
}

export async function createClient(input: CreateClientInput): Promise<ClientSummary> {
  const data = await apiRequest<unknown>(`${API_PREFIX}/clients`, {
    method: 'POST',
    body: JSON.stringify(input),
  });

  return clientSummarySchema.parse(data);
}

export async function updateClient(id: string, input: UpdateClientInput): Promise<ClientSummary> {
  const data = await apiRequest<unknown>(`${API_PREFIX}/clients/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });

  return clientSummarySchema.parse(data);
}

export async function listClientTeam(id: string): Promise<ClientTeamMemberView[]> {
  const data = await apiRequest<unknown>(`${API_PREFIX}/clients/${id}/team`);
  return clientTeamMemberViewSchema.array().parse(data);
}

export async function setClientTeamMember(
  id: string,
  userId: string,
  input: ClientTeamMemberUpdate,
): Promise<ClientTeamMemberView> {
  const data = await apiRequest<unknown>(`${API_PREFIX}/clients/${id}/team/${userId}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  });

  return clientTeamMemberViewSchema.parse(data);
}

export async function removeClientTeamMember(
  id: string,
  userId: string,
): Promise<ClientTeamMemberView> {
  const data = await apiRequest<unknown>(`${API_PREFIX}/clients/${id}/team/${userId}`, {
    method: 'DELETE',
  });

  return clientTeamMemberViewSchema.parse(data);
}

export async function listClientRoles(id: string): Promise<ClientRoleAssignmentView[]> {
  const data = await apiRequest<unknown>(`${API_PREFIX}/clients/${id}/roles`);
  return clientRoleAssignmentViewSchema.array().parse(data);
}

export async function assignClientRole(
  id: string,
  input: ClientRoleAssignmentInput,
): Promise<ClientRoleAssignmentView> {
  const data = await apiRequest<unknown>(`${API_PREFIX}/clients/${id}/roles`, {
    method: 'POST',
    body: JSON.stringify(input),
  });

  return clientRoleAssignmentViewSchema.parse(data);
}

export async function removeClientRole(
  id: string,
  assignmentId: string,
): Promise<ClientRoleAssignmentView> {
  const data = await apiRequest<unknown>(`${API_PREFIX}/clients/${id}/roles/${assignmentId}`, {
    method: 'DELETE',
  });

  return clientRoleAssignmentViewSchema.parse(data);
}
