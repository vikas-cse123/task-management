import mongoose from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  BETTER_AUTH_USER_COLLECTION,
  countActiveAdmins,
  findUserRecord,
  listUsers,
  updateUserRecord,
} from '../src';
import { connectTestDatabase, disconnectTestDatabase, ensureIndexes } from './support/database';
import { hasTestDatabase } from './support/flags';

describe.skipIf(!hasTestDatabase)('user administration service', () => {
  beforeAll(async () => {
    await connectTestDatabase('user_admin');
    await ensureIndexes();
  });

  afterAll(async () => {
    await disconnectTestDatabase();
  });

  beforeEach(async () => {
    await mongoose.connection.collection(BETTER_AUTH_USER_COLLECTION).deleteMany({});
  });

  function users() {
    return mongoose.connection.collection(BETTER_AUTH_USER_COLLECTION);
  }

  async function insertUser(overrides: Record<string, unknown> = {}): Promise<string> {
    const now = new Date();
    const result = await users().insertOne({
      name: 'Test User',
      email: `user-${new mongoose.Types.ObjectId().toString()}@test.local`,
      accessLevel: 'Employee',
      status: 'active',
      jobRoleIds: [],
      capabilities: [],
      requiresPasswordChange: false,
      whatsappNumber: null,
      whatsappOptIn: false,
      whatsappOptInAt: null,
      whatsappOptInSource: null,
      createdBy: null,
      createdAt: now,
      updatedAt: now,
      ...overrides,
    });

    return result.insertedId.toString();
  }

  it('lists and filters users', async () => {
    await insertUser({ accessLevel: 'Admin' });
    await insertUser({ accessLevel: 'Manager', status: 'inactive' });
    await insertUser({ accessLevel: 'Employee', name: 'Searchable Person' });

    const admins = await listUsers({ limit: 50, accessLevel: 'Admin' });
    expect(admins.data).toHaveLength(1);

    const inactive = await listUsers({ limit: 50, status: 'inactive' });
    expect(inactive.data).toHaveLength(1);

    const searched = await listUsers({ limit: 50, search: 'searchable' });
    expect(searched.data).toHaveLength(1);
    expect(searched.data[0]?.name).toBe('Searchable Person');
  });

  it('filters by job role using the stored string id', async () => {
    const roleId = new mongoose.Types.ObjectId().toString();
    await insertUser({ jobRoleIds: [roleId] });
    await insertUser({ jobRoleIds: [] });

    const result = await listUsers({ limit: 50, jobRoleId: roleId });
    expect(result.data).toHaveLength(1);
    expect(result.data[0]?.jobRoleIds).toEqual([roleId]);
  });

  it('paginates with a cursor', async () => {
    await insertUser();
    await insertUser();
    await insertUser();

    const first = await listUsers({ limit: 2 });
    expect(first.data).toHaveLength(2);
    expect(first.nextCursor).not.toBeNull();

    const second = await listUsers({ limit: 2, cursor: first.nextCursor ?? undefined });
    expect(second.data).toHaveLength(1);
    expect(second.data[0]?.id).not.toBe(first.data[0]?.id);
  });

  it('reads and updates a profile, storing job roles as strings', async () => {
    const id = await insertUser();
    const roleId = new mongoose.Types.ObjectId().toString();

    const updated = await updateUserRecord(id, {
      name: 'Renamed',
      accessLevel: 'Manager',
      jobRoleIds: [roleId],
      capabilities: ['clients.manage'],
      whatsappOptIn: true,
      whatsappOptInAt: new Date().toISOString(),
      whatsappOptInSource: 'admin',
    });

    expect(updated?.name).toBe('Renamed');
    expect(updated?.accessLevel).toBe('Manager');
    expect(updated?.jobRoleIds).toEqual([roleId]);
    expect(updated?.capabilities).toEqual(['clients.manage']);
    expect(updated?.whatsappOptIn).toBe(true);

    const stored = await users().findOne({ _id: new mongoose.Types.ObjectId(id) });
    expect(Array.isArray(stored?.jobRoleIds)).toBe(true);
    expect(stored?.jobRoleIds).toContain(roleId);
    expect(stored?.whatsappOptInAt).toBeInstanceOf(Date);
  });

  it('returns null for an unknown user', async () => {
    expect(await findUserRecord(new mongoose.Types.ObjectId().toString())).toBeNull();
  });

  it('counts only active admins', async () => {
    await insertUser({ accessLevel: 'Admin', status: 'active' });
    await insertUser({ accessLevel: 'Admin', status: 'inactive' });
    await insertUser({ accessLevel: 'Admin', status: 'active' });
    await insertUser({ accessLevel: 'Manager', status: 'active' });

    expect(await countActiveAdmins()).toBe(2);
  });
});
