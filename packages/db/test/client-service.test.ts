import mongoose from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  assignClientRole,
  AuditLogModel,
  ClientModel,
  ConflictError,
  createClientRecord,
  deactivateClientTeamMember,
  findClient,
  isActiveClientMember,
  listActiveClientIdsForUser,
  listClients,
  listClientTeamMembers,
  seedReferenceData,
  updateClientRecord,
  upsertClientTeamMember,
  NotFoundError,
  ValidationError,
  type EmployeeDirectory,
} from '../src';
import {
  clearTestDatabase,
  connectTestDatabase,
  disconnectTestDatabase,
  ensureIndexes,
} from './support/database';
import { hasTestDatabase, hasTransactions } from './support/flags';

const ACTOR = new mongoose.Types.ObjectId().toString();
const ACTIVE_USER = new mongoose.Types.ObjectId().toString();
const INACTIVE_USER = new mongoose.Types.ObjectId().toString();
const MANAGER_USER = new mongoose.Types.ObjectId().toString();

function stubDirectory(): EmployeeDirectory {
  return {
    async findById(id: string) {
      if (id === ACTIVE_USER || id === MANAGER_USER) {
        return { id, status: 'active', jobRoleIds: [] };
      }

      if (id === INACTIVE_USER) {
        return { id, status: 'inactive', jobRoleIds: [] };
      }

      return null;
    },
  };
}

describe.skipIf(!hasTestDatabase)('client service', () => {
  beforeAll(async () => {
    await connectTestDatabase('client_service');
    await ensureIndexes();
    await seedReferenceData();
  });

  beforeEach(async () => {
    await clearTestDatabase();
    await seedReferenceData();
  });

  afterAll(async () => {
    await disconnectTestDatabase();
  });

  it('creates a client and audits the change', async () => {
    const client = await createClientRecord({ name: 'Acme Corp', status: 'active' }, ACTOR, {
      directory: stubDirectory(),
    });

    expect(client.name).toBe('Acme Corp');
    expect(client.primaryManagerId).toBeNull();

    const audit = await AuditLogModel.findOne({ action: 'client.create' }).lean();
    expect(audit?.entityId.toString()).toBe(client.id);
  });

  it('rejects duplicate client names', async () => {
    await createClientRecord({ name: 'Acme Corp', status: 'active' }, ACTOR, {
      directory: stubDirectory(),
    });

    await expect(
      createClientRecord({ name: 'Acme Corp', status: 'active' }, ACTOR, {
        directory: stubDirectory(),
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('gives the primary manager an active membership on creation', async () => {
    const client = await createClientRecord(
      { name: 'Acme Corp', status: 'active', primaryManagerId: MANAGER_USER },
      ACTOR,
      { directory: stubDirectory() },
    );

    expect(client.primaryManagerId).toBe(MANAGER_USER);
    expect(await isActiveClientMember(client.id, MANAGER_USER)).toBe(true);

    const members = await listClientTeamMembers(client.id);
    expect(members).toHaveLength(1);
    expect(members[0]?.roleInTeam).toBe('manager');
  });

  it('rejects an inactive primary manager', async () => {
    await expect(
      createClientRecord(
        { name: 'Acme Corp', status: 'active', primaryManagerId: INACTIVE_USER },
        ACTOR,
        { directory: stubDirectory() },
      ),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('rejects an unknown primary manager', async () => {
    await expect(
      createClientRecord(
        {
          name: 'Acme Corp',
          status: 'active',
          primaryManagerId: new mongoose.Types.ObjectId().toString(),
        },
        ACTOR,
        { directory: stubDirectory() },
      ),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('scope-filters listing to assigned clients for members', async () => {
    const first = await createClientRecord({ name: 'Acme', status: 'active' }, ACTOR, {
      directory: stubDirectory(),
    });
    await createClientRecord({ name: 'Globex', status: 'active' }, ACTOR, {
      directory: stubDirectory(),
    });

    await upsertClientTeamMember(
      ACTOR,
      first.id,
      ACTIVE_USER,
      { isActive: true },
      {
        directory: stubDirectory(),
      },
    );

    const scoped = await listClients({ limit: 50 }, { kind: 'member', userId: ACTIVE_USER });
    expect(scoped.data.map((client) => client.id)).toEqual([first.id]);

    const empty = await listClients(
      { limit: 50 },
      { kind: 'member', userId: new mongoose.Types.ObjectId().toString() },
    );
    expect(empty.data).toHaveLength(0);

    const all = await listClients({ limit: 50 }, { kind: 'all' });
    expect(all.data).toHaveLength(2);

    const filtered = await listClients({ limit: 50, search: 'acm' }, { kind: 'all' });
    expect(filtered.data.map((client) => client.name)).toEqual(['Acme']);
  });

  it('updates a client and reassigns the primary manager', async () => {
    const client = await createClientRecord({ name: 'Acme', status: 'active' }, ACTOR, {
      directory: stubDirectory(),
    });

    const updated = await updateClientRecord(
      client.id,
      { name: 'Acme Inc', primaryManagerId: MANAGER_USER },
      ACTOR,
      { directory: stubDirectory() },
    );

    expect(updated.name).toBe('Acme Inc');
    expect(updated.primaryManagerId).toBe(MANAGER_USER);
    expect(await isActiveClientMember(client.id, MANAGER_USER)).toBe(true);

    const found = await findClient(client.id);
    expect(found?.name).toBe('Acme Inc');

    const audit = await AuditLogModel.findOne({ action: 'client.update' }).lean();
    expect(audit).not.toBeNull();
  });

  it('reports a missing client', async () => {
    expect(await findClient(new mongoose.Types.ObjectId().toString())).toBeNull();

    await expect(
      updateClientRecord(new mongoose.Types.ObjectId().toString(), { name: 'Ghost' }, ACTOR, {
        directory: stubDirectory(),
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('adds, reactivates and blocks membership changes', async () => {
    const client = await createClientRecord({ name: 'Acme', status: 'active' }, ACTOR, {
      directory: stubDirectory(),
    });

    const added = await upsertClientTeamMember(
      ACTOR,
      client.id,
      ACTIVE_USER,
      { roleInTeam: 'member', isActive: true },
      { directory: stubDirectory() },
    );
    expect(added.isActive).toBe(true);

    const deactivated = await upsertClientTeamMember(
      ACTOR,
      client.id,
      ACTIVE_USER,
      { isActive: false },
      { directory: stubDirectory() },
    );
    expect(deactivated.isActive).toBe(false);

    const reactivated = await upsertClientTeamMember(
      ACTOR,
      client.id,
      ACTIVE_USER,
      { isActive: true },
      { directory: stubDirectory() },
    );
    expect(reactivated.isActive).toBe(true);

    const actions = (
      await AuditLogModel.find({ entityType: 'client_team_member' }).sort({ _id: 1 }).lean()
    ).map((entry) => entry.action);
    expect(actions).toContain('client.team.assign');
    expect(actions).toContain('client.team.deactivate');
    expect(actions).toContain('client.team.activate');

    await expect(
      upsertClientTeamMember(
        ACTOR,
        client.id,
        INACTIVE_USER,
        { isActive: true },
        {
          directory: stubDirectory(),
        },
      ),
    ).rejects.toBeInstanceOf(ValidationError);

    expect(await listActiveClientIdsForUser(ACTIVE_USER)).toEqual([client.id]);
  });

  it('blocks deactivating the primary manager membership', async () => {
    const client = await createClientRecord(
      { name: 'Acme', status: 'active', primaryManagerId: MANAGER_USER },
      ACTOR,
      { directory: stubDirectory() },
    );

    await expect(deactivateClientTeamMember(ACTOR, client.id, MANAGER_USER)).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it.skipIf(!hasTransactions)('deactivation clears the member designations', async () => {
    const jobRole = await mongoose.connection.collection('jobroles').findOne({});
    expect(jobRole).not.toBeNull();

    const directory: EmployeeDirectory = {
      async findById(id: string) {
        return { id, status: 'active', jobRoleIds: [jobRole?._id.toString() ?? ''] };
      },
    };

    const client = await createClientRecord({ name: 'Acme', status: 'active' }, ACTOR, {
      directory,
    });

    await assignClientRole(
      {
        clientId: client.id,
        jobRoleId: jobRole?._id.toString() ?? '',
        userId: ACTIVE_USER,
        isPrimary: true,
        actorId: ACTOR,
      },
      { directory },
    );

    const deactivated = await deactivateClientTeamMember(ACTOR, client.id, ACTIVE_USER);
    expect(deactivated.isActive).toBe(false);

    const remaining = await mongoose.connection
      .collection('clientroleassignments')
      .countDocuments({ clientId: new mongoose.Types.ObjectId(client.id), isActive: true });
    expect(remaining).toBe(0);

    expect(await ClientModel.countDocuments()).toBe(1);
  });
});
