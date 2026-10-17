import {
  listDepartments as dbListDepartments,
  listJobRoles as dbListJobRoles,
  recordAudit,
  updateDepartment as dbUpdateDepartment,
  updateJobRole as dbUpdateJobRole,
  type DepartmentRecord,
  type JobRoleRecord,
} from '@interscale/db';
import type { UpdateReferenceLabel } from '@interscale/shared';

/**
 * Reference data (departments, functional job roles).
 *
 * Seeded and read-only apart from display name/description edits, which are
 * audited.
 */
export interface ReferenceDataService {
  listDepartments(): Promise<DepartmentRecord[]>;
  listJobRoles(): Promise<JobRoleRecord[]>;
  updateDepartment(
    actorId: string,
    id: string,
    patch: UpdateReferenceLabel,
  ): Promise<DepartmentRecord>;
  updateJobRole(actorId: string, id: string, patch: UpdateReferenceLabel): Promise<JobRoleRecord>;
}

export const dbReferenceDataService: ReferenceDataService = {
  listDepartments: dbListDepartments,
  listJobRoles: dbListJobRoles,

  async updateDepartment(actorId, id, patch) {
    const updated = await dbUpdateDepartment(id, patch);

    await recordAudit({
      actorId,
      action: 'department.update',
      entityType: 'department',
      entityId: id,
      previousValue: null,
      newValue: { name: updated.name, description: updated.description },
      notes: null,
    });

    return updated;
  },

  async updateJobRole(actorId, id, patch) {
    const updated = await dbUpdateJobRole(id, patch);

    await recordAudit({
      actorId,
      action: 'job_role.update',
      entityType: 'job_role',
      entityId: id,
      previousValue: null,
      newValue: { name: updated.name, description: updated.description },
      notes: null,
    });

    return updated;
  },
};
