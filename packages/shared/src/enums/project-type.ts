/**
 * Project types (docs/00-product-requirements.md §2).
 *
 * Exactly these three; no unrelated types without justification. Stored as
 * stable internal values; the UI shows the labels.
 */
export const PROJECT_TYPES = ['campaign', 'onboarding', 'general'] as const;

export type ProjectType = (typeof PROJECT_TYPES)[number];

export const PROJECT_TYPE_LABELS: Record<ProjectType, string> = {
  campaign: 'Campaign',
  onboarding: 'Onboarding',
  general: 'General',
};
