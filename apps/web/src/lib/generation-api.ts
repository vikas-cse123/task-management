import {
  API_PREFIX,
  projectGenerationPreviewSchema,
  projectGenerationResultSchema,
  type ProjectGenerationInput,
  type ProjectGenerationPreview,
  type ProjectGenerationPreviewInput,
  type ProjectGenerationResult,
} from '@interscale/shared';
import { apiRequest } from './api';

/** Deterministic project generation from a published template (Step 22/23). */

export async function previewProjectFromTemplate(
  input: ProjectGenerationPreviewInput,
): Promise<ProjectGenerationPreview> {
  const data = await apiRequest<unknown>(`${API_PREFIX}/projects/from-template/preview`, {
    method: 'POST',
    body: JSON.stringify(input),
  });

  return projectGenerationPreviewSchema.parse(data);
}

export async function createProjectFromTemplate(
  input: ProjectGenerationInput,
): Promise<ProjectGenerationResult> {
  const data = await apiRequest<unknown>(`${API_PREFIX}/projects/from-template`, {
    method: 'POST',
    body: JSON.stringify(input),
  });

  return projectGenerationResultSchema.parse(data);
}
