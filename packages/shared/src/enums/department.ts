/**
 * The four organizational departments.
 *
 * These are seeded reference data. Employees are NOT restricted to a single
 * department: their department associations are derived from their job roles.
 */
export const DEPARTMENT_KEYS = [
  'creative_production',
  'performance_marketing',
  'crm_data_operations',
  'project_management',
] as const;

export type DepartmentKey = (typeof DEPARTMENT_KEYS)[number];
