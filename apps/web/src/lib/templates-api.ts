import {
  API_PREFIX,
  templateDetailSchema,
  templateSummarySchema,
  templateValidationResultSchema,
  templateVersionDetailSchema,
  type ArchiveTemplateInput,
  type CreateTemplateInput,
  type PublishTemplateInput,
  type TemplateDetail,
  type TemplateDraftInput,
  type TemplateSummary,
  type TemplateValidationResult,
  type TemplateVersionDetail,
  type UpdateTemplateInput,
} from '@interscale/shared';
import { apiRequest } from './api';

/** Template administration + read client (Step 23). */

export interface TemplateFilters {
  search?: string;
  status?: string;
  type?: string;
}

export async function listTemplates(filters: TemplateFilters = {}): Promise<TemplateSummary[]> {
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

  const data = await apiRequest<unknown>(`${API_PREFIX}/templates?${params.toString()}`);
  return templateSummarySchema.array().parse(data);
}

export async function getTemplate(id: string): Promise<TemplateDetail> {
  const data = await apiRequest<unknown>(`${API_PREFIX}/templates/${id}`);
  return templateDetailSchema.parse(data);
}

export async function getTemplateVersion(
  id: string,
  version: number,
): Promise<TemplateVersionDetail> {
  const data = await apiRequest<unknown>(`${API_PREFIX}/templates/${id}/versions/${version}`);
  return templateVersionDetailSchema.parse(data);
}

export async function createTemplate(input: CreateTemplateInput): Promise<TemplateSummary> {
  const data = await apiRequest<unknown>(`${API_PREFIX}/templates`, {
    method: 'POST',
    body: JSON.stringify(input),
  });

  return templateSummarySchema.parse(data);
}

export async function updateTemplate(
  id: string,
  input: UpdateTemplateInput,
): Promise<TemplateSummary> {
  const data = await apiRequest<unknown>(`${API_PREFIX}/templates/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });

  return templateSummarySchema.parse(data);
}

export async function ensureDraft(id: string): Promise<TemplateVersionDetail> {
  const data = await apiRequest<unknown>(`${API_PREFIX}/templates/${id}/draft`, { method: 'POST' });
  return templateVersionDetailSchema.parse(data);
}

export async function replaceDraft(
  id: string,
  draft: TemplateDraftInput,
): Promise<TemplateVersionDetail> {
  const data = await apiRequest<unknown>(`${API_PREFIX}/templates/${id}/draft`, {
    method: 'PUT',
    body: JSON.stringify(draft),
  });

  return templateVersionDetailSchema.parse(data);
}

export interface TemplateValidationOutcome {
  readonly version: number;
  readonly result: TemplateValidationResult;
}

export async function validateTemplate(
  id: string,
  version?: number,
): Promise<TemplateValidationOutcome> {
  const data = await apiRequest<unknown>(`${API_PREFIX}/templates/${id}/validate`, {
    method: 'POST',
    body: JSON.stringify(version ? { version } : {}),
  });

  const candidate = data as { version: number; result: unknown };
  return {
    version: candidate.version,
    result: templateValidationResultSchema.parse(candidate.result),
  };
}

export async function publishTemplate(
  id: string,
  input: PublishTemplateInput,
): Promise<TemplateSummary> {
  const data = await apiRequest<unknown>(`${API_PREFIX}/templates/${id}/publish`, {
    method: 'POST',
    body: JSON.stringify(input),
  });

  return templateSummarySchema.parse(data);
}

export async function archiveTemplate(
  id: string,
  input: ArchiveTemplateInput,
): Promise<TemplateSummary> {
  const data = await apiRequest<unknown>(`${API_PREFIX}/templates/${id}/archive`, {
    method: 'POST',
    body: JSON.stringify(input),
  });

  return templateSummarySchema.parse(data);
}
