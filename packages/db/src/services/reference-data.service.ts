import type { UpdateReferenceLabel } from '@interscale/shared';
import mongoose from 'mongoose';
import { NotFoundError, ValidationError } from '../lib/errors';
import { DepartmentModel } from '../models/department';
import { JobRoleModel } from '../models/job-role';

/**
 * Reference-data access for departments and functional job roles.
 *
 * Records are seeded (see `seed/reference-data.ts`); the API only lists them
 * and lets an Admin edit display name/description. Keys and relationships are
 * immutable.
 */

export interface DepartmentRecord {
  id: string;
  key: string;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface JobRoleRecord {
  id: string;
  key: string;
  name: string;
  departmentId: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

export async function listDepartments(): Promise<DepartmentRecord[]> {
  const rows = await DepartmentModel.find().sort({ key: 1 }).lean();

  return rows.map((row) => ({
    id: row._id.toString(),
    key: row.key,
    name: row.name,
    description: row.description ?? null,
    createdAt: new Date(row.createdAt).toISOString(),
    updatedAt: new Date(row.updatedAt).toISOString(),
  }));
}

export async function listJobRoles(): Promise<JobRoleRecord[]> {
  const rows = await JobRoleModel.find().sort({ key: 1 }).lean();

  return rows.map((row) => ({
    id: row._id.toString(),
    key: row.key,
    name: row.name,
    departmentId: row.departmentId.toString(),
    description: row.description ?? null,
    createdAt: new Date(row.createdAt).toISOString(),
    updatedAt: new Date(row.updatedAt).toISOString(),
  }));
}

/** Return the subset of the given ids that exist as job roles. */
export async function findExistingJobRoleIds(ids: readonly string[]): Promise<string[]> {
  if (ids.length === 0) {
    return [];
  }

  for (const id of ids) {
    if (!mongoose.isValidObjectId(id)) {
      throw new ValidationError('A valid job role identifier is required');
    }
  }

  const rows = await JobRoleModel.find({
    _id: { $in: ids.map((id) => new mongoose.Types.ObjectId(id)) },
  })
    .select({ _id: 1 })
    .lean();

  return rows.map((row) => row._id.toString());
}

export async function updateDepartment(
  id: string,
  patch: UpdateReferenceLabel,
): Promise<DepartmentRecord> {
  if (!mongoose.isValidObjectId(id)) {
    throw new ValidationError('A valid department identifier is required');
  }

  const update: Record<string, unknown> = {};

  if (patch.name !== undefined) update.name = patch.name;
  if (patch.description !== undefined) update.description = patch.description;

  const row = await DepartmentModel.findByIdAndUpdate(
    id,
    { $set: update },
    {
      new: true,
      runValidators: true,
    },
  ).lean();

  if (!row) {
    throw new NotFoundError('Department');
  }

  return {
    id: row._id.toString(),
    key: row.key,
    name: row.name,
    description: row.description ?? null,
    createdAt: new Date(row.createdAt).toISOString(),
    updatedAt: new Date(row.updatedAt).toISOString(),
  };
}

export async function updateJobRole(
  id: string,
  patch: UpdateReferenceLabel,
): Promise<JobRoleRecord> {
  if (!mongoose.isValidObjectId(id)) {
    throw new ValidationError('A valid job role identifier is required');
  }

  const update: Record<string, unknown> = {};

  if (patch.name !== undefined) update.name = patch.name;
  if (patch.description !== undefined) update.description = patch.description;

  const row = await JobRoleModel.findByIdAndUpdate(
    id,
    { $set: update },
    {
      new: true,
      runValidators: true,
    },
  ).lean();

  if (!row) {
    throw new NotFoundError('Job role');
  }

  return {
    id: row._id.toString(),
    key: row.key,
    name: row.name,
    departmentId: row.departmentId.toString(),
    description: row.description ?? null,
    createdAt: new Date(row.createdAt).toISOString(),
    updatedAt: new Date(row.updatedAt).toISOString(),
  };
}
