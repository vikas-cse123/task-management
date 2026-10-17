import {
  DEFAULT_ACCESS_LEVEL,
  DEFAULT_USER_STATUS,
  type AccessLevel,
  type Capability,
  type UserStatus,
} from '@interscale/shared';
import mongoose from 'mongoose';
import type { Collection, Connection } from 'mongoose';
import { getConnection } from '../connection';
import { BETTER_AUTH_USER_COLLECTION } from '../identity';
import { assertObjectId } from '../lib/object-id';
import type { EmployeeListQuery } from '@interscale/shared';

/**
 * Server-side user administration.
 *
 * Reads and writes the application profile fields on the Better Auth `user`
 * document (ADR 0005). Account creation (which needs password hashing) is
 * orchestrated by the API layer through Better Auth; this service owns profile
 * updates, listing and the safety rules that must hold regardless of caller.
 */

export interface UserAdminServiceOptions {
  connection?: Connection;
}

function resolveConnection(options: UserAdminServiceOptions): Connection {
  return options.connection ?? getConnection();
}

/** A user document projected with a string `id` (Better Auth `_id`). */
export interface UserRecord {
  id: string;
  name: string;
  email: string;
  accessLevel: AccessLevel;
  status: UserStatus;
  jobRoleIds: string[];
  capabilities: Capability[];
  requiresPasswordChange: boolean;
  whatsappNumber: string | null;
  whatsappOptIn: boolean;
  whatsappOptInAt: string | null;
  whatsappOptInSource: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

interface RawDoc {
  _id: mongoose.Types.ObjectId;
  name?: unknown;
  email?: unknown;
  accessLevel?: unknown;
  status?: unknown;
  jobRoleIds?: unknown;
  capabilities?: unknown;
  requiresPasswordChange?: unknown;
  whatsappNumber?: unknown;
  whatsappOptIn?: unknown;
  whatsappOptInAt?: unknown;
  whatsappOptInSource?: unknown;
  createdBy?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
}

const ACCESS_LEVEL_VALUES: readonly string[] = ['Admin', 'Manager', 'Employee'];

type UserFilter = Exclude<Parameters<Collection<RawDoc>['find']>[0], undefined>;

function toStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String) : [];
}

function asIso(value: unknown): string {
  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === 'string') {
    const parsed = new Date(value);

    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  }

  return new Date(0).toISOString();
}

function toRecord(doc: RawDoc): UserRecord {
  return {
    id: doc._id.toString(),
    name: typeof doc.name === 'string' ? doc.name : '',
    email: typeof doc.email === 'string' ? doc.email : '',
    accessLevel: ACCESS_LEVEL_VALUES.includes(String(doc.accessLevel))
      ? (doc.accessLevel as AccessLevel)
      : DEFAULT_ACCESS_LEVEL,
    status: doc.status === 'inactive' ? 'inactive' : DEFAULT_USER_STATUS,
    jobRoleIds: toStringArray(doc.jobRoleIds),
    capabilities: toStringArray(doc.capabilities) as Capability[],
    requiresPasswordChange: doc.requiresPasswordChange === true,
    whatsappNumber: typeof doc.whatsappNumber === 'string' ? doc.whatsappNumber : null,
    whatsappOptIn: doc.whatsappOptIn === true,
    whatsappOptInAt: typeof doc.whatsappOptInAt === 'string' ? doc.whatsappOptInAt : null,
    whatsappOptInSource:
      typeof doc.whatsappOptInSource === 'string' ? doc.whatsappOptInSource : null,
    createdBy: typeof doc.createdBy === 'string' ? doc.createdBy : null,
    createdAt: asIso(doc.createdAt),
    updatedAt: asIso(doc.updatedAt),
  };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export interface UserListResult {
  readonly data: UserRecord[];
  readonly nextCursor: string | null;
}

/** List users with filters and `_id`-based cursor pagination. */
export async function listUsers(
  query: EmployeeListQuery,
  options: UserAdminServiceOptions = {},
): Promise<UserListResult> {
  const connection = resolveConnection(options);
  const filter: UserFilter = {};

  if (query.status) {
    filter.status = query.status;
  }

  if (query.accessLevel) {
    filter.accessLevel = query.accessLevel;
  }

  if (query.jobRoleId) {
    filter.jobRoleIds = query.jobRoleId;
  }

  if (query.search) {
    const pattern = new RegExp(escapeRegExp(query.search), 'i');
    filter.$or = [{ name: pattern }, { email: pattern }];
  }

  if (query.cursor) {
    filter._id = { $gt: new mongoose.Types.ObjectId(query.cursor) };
  }

  const rows = await connection
    .collection<RawDoc>(BETTER_AUTH_USER_COLLECTION)
    .find(filter)
    .sort({ _id: 1 })
    .limit(query.limit + 1)
    .toArray();

  const hasMore = rows.length > query.limit;
  const page = hasMore ? rows.slice(0, query.limit) : rows;
  const last = page.at(-1);

  return {
    data: page.map(toRecord),
    nextCursor: hasMore && last ? last._id.toString() : null,
  };
}

/** Fetch a single user record, or `null` when absent. */
export async function findUserRecord(
  id: string,
  options: UserAdminServiceOptions = {},
): Promise<UserRecord | null> {
  if (!mongoose.isValidObjectId(id)) {
    return null;
  }

  const doc = await resolveConnection(options)
    .collection<RawDoc>(BETTER_AUTH_USER_COLLECTION)
    .findOne({ _id: new mongoose.Types.ObjectId(id) });

  return doc ? toRecord(doc) : null;
}

/** Number of currently-active Admins (used for lockout protection). */
export async function countActiveAdmins(options: UserAdminServiceOptions = {}): Promise<number> {
  return resolveConnection(options)
    .collection(BETTER_AUTH_USER_COLLECTION)
    .countDocuments({ accessLevel: 'Admin', status: { $ne: 'inactive' } });
}

/** Profile fields that may be updated through the Admin API. */
export interface UserProfilePatch {
  name?: string;
  accessLevel?: AccessLevel;
  status?: UserStatus;
  jobRoleIds?: string[];
  capabilities?: Capability[];
  whatsappNumber?: string | null;
  whatsappOptIn?: boolean;
  whatsappOptInAt?: string | null;
  whatsappOptInSource?: string | null;
}

function toUpdateDocument(patch: UserProfilePatch): Record<string, unknown> {
  const set: Record<string, unknown> = {};

  if (patch.name !== undefined) set.name = patch.name;
  if (patch.accessLevel !== undefined) set.accessLevel = patch.accessLevel;
  if (patch.status !== undefined) set.status = patch.status;
  if (patch.jobRoleIds !== undefined) {
    // Stored as strings to match the Better Auth `string[]` additional field.
    set.jobRoleIds = [...patch.jobRoleIds];
  }
  if (patch.capabilities !== undefined) set.capabilities = [...patch.capabilities];
  if (patch.whatsappNumber !== undefined) set.whatsappNumber = patch.whatsappNumber;
  if (patch.whatsappOptIn !== undefined) set.whatsappOptIn = patch.whatsappOptIn;
  if (patch.whatsappOptInAt !== undefined) {
    set.whatsappOptInAt = patch.whatsappOptInAt === null ? null : new Date(patch.whatsappOptInAt);
  }
  if (patch.whatsappOptInSource !== undefined) set.whatsappOptInSource = patch.whatsappOptInSource;

  set.updatedAt = new Date();

  return set;
}

/** Apply profile-field updates and return the resulting record. */
export async function updateUserRecord(
  id: string,
  patch: UserProfilePatch,
  options: UserAdminServiceOptions = {},
): Promise<UserRecord | null> {
  const objectId = new mongoose.Types.ObjectId(assertObjectId(id, 'user'));

  await resolveConnection(options)
    .collection<RawDoc>(BETTER_AUTH_USER_COLLECTION)
    .updateOne({ _id: objectId }, { $set: toUpdateDocument(patch) });

  return findUserRecord(id, options);
}
