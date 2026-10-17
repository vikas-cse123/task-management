import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  ClientRoleAssignmentInput,
  ClientTeamMemberUpdate,
  CreateClientInput,
  UpdateClientInput,
} from '@interscale/shared';
import {
  assignClientRole,
  createClient,
  getClient,
  listClientRoles,
  listClients,
  listClientTeam,
  removeClientRole,
  removeClientTeamMember,
  setClientTeamMember,
  updateClient,
} from '../lib/clients-api';

const CLIENTS_KEY = ['clients'] as const;

function detailKey(id: string) {
  return ['clients', id] as const;
}

function teamKey(id: string) {
  return ['clients', id, 'team'] as const;
}

function rolesKey(id: string) {
  return ['clients', id, 'roles'] as const;
}

export function useClients(search = '', enabled = true) {
  return useQuery({
    queryKey: [...CLIENTS_KEY, { search }],
    queryFn: () => listClients(search),
    enabled,
    retry: false,
  });
}

export function useClient(id: string | undefined) {
  return useQuery({
    queryKey: id ? detailKey(id) : ['clients', 'missing'],
    queryFn: () => getClient(id ?? ''),
    enabled: Boolean(id),
    retry: false,
  });
}

export function useClientTeam(id: string | undefined) {
  return useQuery({
    queryKey: id ? teamKey(id) : ['clients', 'missing', 'team'],
    queryFn: () => listClientTeam(id ?? ''),
    enabled: Boolean(id),
    retry: false,
  });
}

export function useClientRoles(id: string | undefined) {
  return useQuery({
    queryKey: id ? rolesKey(id) : ['clients', 'missing', 'roles'],
    queryFn: () => listClientRoles(id ?? ''),
    enabled: Boolean(id),
    retry: false,
  });
}

function invalidateClient(queryClient: ReturnType<typeof useQueryClient>, id: string) {
  void queryClient.invalidateQueries({ queryKey: CLIENTS_KEY });
  void queryClient.invalidateQueries({ queryKey: detailKey(id) });
  void queryClient.invalidateQueries({ queryKey: teamKey(id) });
  void queryClient.invalidateQueries({ queryKey: rolesKey(id) });
}

export function useCreateClient() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateClientInput) => createClient(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: CLIENTS_KEY }),
  });
}

export function useUpdateClient(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: UpdateClientInput) => updateClient(id, input),
    onSuccess: () => invalidateClient(queryClient, id),
  });
}

export function useSetClientTeamMember(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ userId, input }: { userId: string; input: ClientTeamMemberUpdate }) =>
      setClientTeamMember(id, userId, input),
    onSuccess: () => invalidateClient(queryClient, id),
  });
}

export function useRemoveClientTeamMember(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (userId: string) => removeClientTeamMember(id, userId),
    onSuccess: () => invalidateClient(queryClient, id),
  });
}

export function useAssignClientRole(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: ClientRoleAssignmentInput) => assignClientRole(id, input),
    onSuccess: () => invalidateClient(queryClient, id),
  });
}

export function useRemoveClientRole(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (assignmentId: string) => removeClientRole(id, assignmentId),
    onSuccess: () => invalidateClient(queryClient, id),
  });
}
