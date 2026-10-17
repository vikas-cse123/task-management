/**
 * Functional job roles.
 *
 * Functional job roles are independent of application access levels. One
 * employee may hold multiple job roles, potentially spanning departments.
 * These are seeded reference data with stable identifiers.
 */
export const JOB_ROLE_KEYS = [
  'video_ad_script_writer',
  'video_editor',
  'graphic_designer',
  'performance_marketer',
  'crm_data_executive',
  'project_manager',
] as const;

export type JobRoleKey = (typeof JOB_ROLE_KEYS)[number];
