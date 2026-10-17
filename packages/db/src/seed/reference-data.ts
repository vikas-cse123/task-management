import type { DepartmentKey, JobRoleKey } from '@interscale/shared';
import { DepartmentModel } from '../models/department';
import { JobRoleModel } from '../models/job-role';

export interface DepartmentSeed {
  key: DepartmentKey;
  name: string;
  description: string;
}

export interface JobRoleSeed {
  key: JobRoleKey;
  name: string;
  departmentKey: DepartmentKey;
  description: string;
}

/** The four seeded departments (docs/00 §3, decision D7). */
export const DEPARTMENT_SEED: readonly DepartmentSeed[] = [
  {
    key: 'creative_production',
    name: 'Creative Production',
    description: 'Video ad scripts, video editing, and graphic design.',
  },
  {
    key: 'performance_marketing',
    name: 'Performance Marketing',
    description: 'Campaign research, Meta ad copy, campaign setup, launch and reviews.',
  },
  {
    key: 'crm_data_operations',
    name: 'CRM & Data Operations',
    description: 'Travel CRM personalization, itinerary, package and master data entry.',
  },
  {
    key: 'project_management',
    name: 'Project Management',
    description: 'Client meetings, agendas, notes, decisions and coordination.',
  },
];

/** The six seeded functional job roles (docs/00 §3, decision D7). */
export const JOB_ROLE_SEED: readonly JobRoleSeed[] = [
  {
    key: 'video_ad_script_writer',
    name: 'Video Ad Script Writer',
    departmentKey: 'creative_production',
    description: 'Writes video advertising scripts and revises rejected scripts.',
  },
  {
    key: 'video_editor',
    name: 'Video Editor',
    departmentKey: 'creative_production',
    description: 'Edits campaign video advertisements after script approval.',
  },
  {
    key: 'graphic_designer',
    name: 'Graphic Designer',
    departmentKey: 'creative_production',
    description: 'Creates static creatives and carousel designs.',
  },
  {
    key: 'performance_marketer',
    name: 'Performance Marketer',
    departmentKey: 'performance_marketing',
    description: 'Competitor research, campaign briefs, Meta ad copy, campaign setup and launch.',
  },
  {
    key: 'crm_data_executive',
    name: 'CRM/Data Executive',
    departmentKey: 'crm_data_operations',
    description: 'Travel CRM personalization, itinerary and master data entry.',
  },
  {
    key: 'project_manager',
    name: 'Project Manager',
    departmentKey: 'project_management',
    description: 'Client meeting scheduling, agendas, notes and follow-up coordination.',
  },
];

export interface SeedSummary {
  departments: number;
  jobRoles: number;
}

/**
 * Seed the reference departments and functional job roles.
 *
 * Idempotent and non-destructive: records are created if missing but existing
 * records (including Admin-edited `name`/`description`) are never overwritten,
 * and stable `key` identifiers are preserved. Safe to run repeatedly.
 */
export async function seedReferenceData(): Promise<SeedSummary> {
  await DepartmentModel.bulkWrite(
    DEPARTMENT_SEED.map((department) => ({
      updateOne: {
        filter: { key: department.key },
        update: {
          $setOnInsert: {
            key: department.key,
            name: department.name,
            description: department.description,
          },
        },
        upsert: true,
      },
    })),
    { ordered: false },
  );

  const departments = await DepartmentModel.find({
    key: { $in: DEPARTMENT_SEED.map((department) => department.key) },
  }).lean();

  const departmentIdByKey = new Map(
    departments.map((department) => [department.key, department._id]),
  );

  await JobRoleModel.bulkWrite(
    JOB_ROLE_SEED.map((jobRole) => {
      const departmentId = departmentIdByKey.get(jobRole.departmentKey);

      if (!departmentId) {
        throw new Error(`Missing seeded department for job role "${jobRole.key}".`);
      }

      return {
        updateOne: {
          filter: { key: jobRole.key },
          update: {
            $setOnInsert: {
              key: jobRole.key,
              name: jobRole.name,
              description: jobRole.description,
              departmentId,
            },
          },
          upsert: true,
        },
      };
    }),
    { ordered: false },
  );

  const departmentCount = await DepartmentModel.countDocuments();
  const jobRoleCount = await JobRoleModel.countDocuments();

  return { departments: departmentCount, jobRoles: jobRoleCount };
}
