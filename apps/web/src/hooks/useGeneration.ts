import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ProjectGenerationInput, ProjectGenerationPreviewInput } from '@interscale/shared';
import { createProjectFromTemplate, previewProjectFromTemplate } from '../lib/generation-api';

/** Server-validated preview and atomic creation from a published template. */

export function usePreviewProjectFromTemplate() {
  return useMutation({
    mutationFn: (input: ProjectGenerationPreviewInput) => previewProjectFromTemplate(input),
  });
}

export function useCreateProjectFromTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: ProjectGenerationInput) => createProjectFromTemplate(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['projects'] }),
  });
}
