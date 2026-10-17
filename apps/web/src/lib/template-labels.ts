import type { JobRoleKey } from '@interscale/shared';

/** Human-readable labels for template-referenced stable keys (never raw IDs). */

export function humanizeKey(key: string): string {
  return key
    .split('_')
    .filter((part) => part.length > 0)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

const JOB_ROLE_LABELS: Record<JobRoleKey, string> = {
  video_ad_script_writer: 'Video Ad Script Writer',
  video_editor: 'Video Editor',
  graphic_designer: 'Graphic Designer',
  performance_marketer: 'Performance Marketer',
  crm_data_executive: 'CRM / Data Executive',
  project_manager: 'Project Manager',
};

export function jobRoleLabel(key: string): string {
  return JOB_ROLE_LABELS[key as JobRoleKey] ?? humanizeKey(key);
}
