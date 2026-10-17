/**
 * Project lifecycle statuses (docs/00-product-requirements.md §2).
 *
 * Kept separate from task statuses. Changing a project status never rewrites
 * individual task statuses. Stored as stable internal values; the UI shows
 * the labels.
 */
export const PROJECT_STATUSES = [
  'planned',
  'in_progress',
  'live',
  'on_hold',
  'completed',
  'cancelled',
] as const;

export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  planned: 'Planned',
  in_progress: 'In Progress',
  live: 'Live/Ongoing',
  on_hold: 'On Hold',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

export const DEFAULT_PROJECT_STATUS: ProjectStatus = 'planned';
