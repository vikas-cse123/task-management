import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  ArchiveTemplateInput,
  CreateTemplateInput,
  PublishTemplateInput,
  TemplateDraftInput,
  UpdateTemplateInput,
} from '@interscale/shared';
import {
  archiveTemplate,
  createTemplate,
  ensureDraft,
  getTemplate,
  getTemplateVersion,
  listTemplates,
  publishTemplate,
  replaceDraft,
  updateTemplate,
  validateTemplate,
  type TemplateFilters,
} from '../lib/templates-api';

const TEMPLATES_KEY = ['templates'] as const;

function detailKey(id: string) {
  return ['templates', id] as const;
}

function versionKey(id: string, version: number) {
  return ['templates', id, 'versions', version] as const;
}

export function useTemplates(filters: TemplateFilters = {}, enabled = true) {
  const { search, status, type } = filters;

  return useQuery({
    queryKey: [...TEMPLATES_KEY, { search: search ?? '', status: status ?? '', type: type ?? '' }],
    queryFn: () => listTemplates(filters),
    enabled,
    retry: false,
  });
}

export function useTemplate(id: string | undefined) {
  return useQuery({
    queryKey: id ? detailKey(id) : ['templates', 'missing'],
    queryFn: () => getTemplate(id ?? ''),
    enabled: Boolean(id),
    retry: false,
  });
}

export function useTemplateVersion(id: string | undefined, version: number | undefined) {
  return useQuery({
    queryKey:
      id && version ? versionKey(id, version) : ['templates', 'missing', 'versions', version ?? 0],
    queryFn: () => getTemplateVersion(id ?? '', version ?? 0),
    enabled: Boolean(id) && typeof version === 'number',
    retry: false,
  });
}

function invalidateTemplate(queryClient: ReturnType<typeof useQueryClient>, id?: string) {
  void queryClient.invalidateQueries({ queryKey: TEMPLATES_KEY });

  if (id) {
    void queryClient.invalidateQueries({ queryKey: detailKey(id) });
  }
}

export function useCreateTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateTemplateInput) => createTemplate(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: TEMPLATES_KEY }),
  });
}

export function useUpdateTemplate(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: UpdateTemplateInput) => updateTemplate(id, input),
    onSuccess: () => invalidateTemplate(queryClient, id),
  });
}

export function useEnsureDraft(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => ensureDraft(id),
    onSuccess: () => invalidateTemplate(queryClient, id),
  });
}

export function useReplaceDraft(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (draft: TemplateDraftInput) => replaceDraft(id, draft),
    onSuccess: () => invalidateTemplate(queryClient, id),
  });
}

export function useValidateTemplate(id: string) {
  return useMutation({
    mutationFn: (version?: number) => validateTemplate(id, version),
  });
}

export function usePublishTemplate(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: PublishTemplateInput) => publishTemplate(id, input),
    onSuccess: () => invalidateTemplate(queryClient, id),
  });
}

export function useArchiveTemplate(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: ArchiveTemplateInput) => archiveTemplate(id, input),
    onSuccess: () => invalidateTemplate(queryClient, id),
  });
}
