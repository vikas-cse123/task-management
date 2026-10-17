import mongoose from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  ClientRoleAssignmentModel,
  createClientRecord,
  resolveTaskAssignee,
  seedReferenceData,
  upsertClientTeamMember,
  JobRoleModel,
  type EmployeeDirectory,
} from '../src';
import {
  clearTestDatabase,
  connectTestDatabase,
  disconnectTestDatabase,
  ensureIndexes,
} from './support/database';
import { hasTestDatabase } from './support/flags';

const ACTOR = new mongoose.Types.ObjectId().toString();
const WRITER_A = new mongoose.Types.ObjectId().toString();
const EDITOR_A = new mongoose.Types.ObjectId().toString();
const EDITOR_B = new mongoose.Types.ObjectId().toString();
const MULTI = new mongoose.Types.ObjectId().toString();

let roleWriter = '';
let roleEditor = '';
let inactiveIds: string[] = [];

function stubDirectory(): EmployeeDirectory {
  return {
    async findById(id: string) {
      if (inactiveIds.includes(id)) {
        return { id, status: 'inactive', jobRoleIds: [roleWriter, roleEditor] };
      }

      if ([WRITER_A, EDITOR_A, EDITOR_B, MULTI].includes(id)) {
        return { id, status: 'active', jobRoleIds: [roleWriter, roleEditor] };
      }

      return null;
    },
  };
}

describe.skipIf(!hasTestDatabase)('assignment resolution', () => {
  let clientA = '';
  let clientB = '';

  beforeAll(async () => {
    await connectTestDatabase('assignment_service');
    await ensureIndexes();
  });

  beforeEach(async () => {
    await clearTestDatabase();
    await seedReferenceData();
    inactiveIds = [];

    const roles = await JobRoleModel.find().select({ _id: 1 }).sort({ _id: 1 }).lean();
    roleWriter = roles[0]?._id.toString() ?? '';
    roleEditor = roles[1]?._id.toString() ?? '';

    const directory = stubDirectory();
    const a = await createClientRecord({ name: 'Client A', status: 'active' }, ACTOR, {
      directory,
    });
    const b = await createClientRecord({ name: 'Client B', status: 'active' }, ACTOR, {
      directory,
    });
    clientA = a.id;
    clientB = b.id;

    for (const user of [WRITER_A, EDITOR_A, MULTI]) {
      await upsertClientTeamMember(ACTOR, clientA, user, { isActive: true }, { directory });
    }

    await upsertClientTeamMember(ACTOR, clientB, EDITOR_B, { isActive: true }, { directory });

    await ClientRoleAssignmentModel.create([
      {
        clientId: clientA,
        userId: WRITER_A,
        jobRoleId: roleWriter,
        isPrimary: true,
        isActive: true,
      },
      {
        clientId: clientA,
        userId: EDITOR_A,
        jobRoleId: roleEditor,
        isPrimary: true,
        isActive: true,
      },
      {
        clientId: clientB,
        userId: EDITOR_B,
        jobRoleId: roleEditor,
        isPrimary: true,
        isActive: true,
      },
    ]);
  });

  afterAll(async () => {
    await disconnectTestDatabase();
  });

  it('selects the client-specific designated employee per role', async () => {
    const writer = await resolveTaskAssignee({
      clientId: clientA,
      jobRoleId: roleWriter,
      directory: stubDirectory(),
    });
    expect(writer).toEqual({ action: 'assign', employeeId: WRITER_A, source: 'role_mapping' });

    const editor = await resolveTaskAssignee({
      clientId: clientA,
      jobRoleId: roleEditor,
      directory: stubDirectory(),
    });
    expect(editor).toEqual({ action: 'assign', employeeId: EDITOR_A, source: 'role_mapping' });
  });

  it('keeps clients isolated and supports multi-role employees', async () => {
    const other = await resolveTaskAssignee({
      clientId: clientB,
      jobRoleId: roleEditor,
      directory: stubDirectory(),
    });
    expect(other).toEqual({ action: 'assign', employeeId: EDITOR_B, source: 'role_mapping' });

    // MULTI holds both roles and sits on clientA's team: eligible anywhere.
    const kept = await resolveTaskAssignee({
      clientId: clientA,
      jobRoleId: roleWriter,
      existingAssigneeId: MULTI,
      directory: stubDirectory(),
    });
    expect(kept).toEqual({ action: 'keep' });
  });

  it('preserves valid manual assignments and reports the rest', async () => {
    const kept = await resolveTaskAssignee({
      clientId: clientA,
      jobRoleId: roleEditor,
      existingAssigneeId: EDITOR_A,
      directory: stubDirectory(),
    });
    expect(kept).toEqual({ action: 'keep' });

    const missing = await resolveTaskAssignee({
      clientId: clientA,
      jobRoleId: roleWriter,
      directory: stubDirectory(),
    });
    // A primary writer mapping exists, so this resolves; remove it first.
    expect(missing.action).toBe('assign');

    await ClientRoleAssignmentModel.deleteMany({ clientId: clientA, jobRoleId: roleWriter });

    const needsManager = await resolveTaskAssignee({
      clientId: clientA,
      jobRoleId: roleWriter,
      directory: stubDirectory(),
    });
    expect(needsManager.action).toBe('needs_manager');
    expect((needsManager as { reason: string }).reason).toMatch(/No designated/);

    const noRole = await resolveTaskAssignee({
      clientId: clientA,
      jobRoleId: null,
      directory: stubDirectory(),
    });
    expect(noRole.action).toBe('needs_manager');

    const template = await resolveTaskAssignee({
      clientId: clientA,
      jobRoleId: roleEditor,
      templateOverrideId: new mongoose.Types.ObjectId().toString(),
      directory: stubDirectory(),
    });
    expect(template.action).toBe('needs_manager');
  });

  it('rejects inactive, mismatched and non-member candidates without guessing', async () => {
    inactiveIds = [EDITOR_A];

    const inactive = await resolveTaskAssignee({
      clientId: clientA,
      jobRoleId: roleEditor,
      directory: stubDirectory(),
    });
    expect(inactive.action).toBe('needs_manager');

    const outsider = new mongoose.Types.ObjectId().toString();
    const unknown = await resolveTaskAssignee({
      clientId: clientA,
      jobRoleId: roleEditor,
      existingAssigneeId: outsider,
      directory: stubDirectory(),
    });
    expect(unknown.action).toBe('needs_manager');

    // Same employee, different client team: not eligible there.
    const wrongClient = await resolveTaskAssignee({
      clientId: clientB,
      jobRoleId: roleEditor,
      existingAssigneeId: EDITOR_A,
      directory: stubDirectory(),
    });
    expect(wrongClient.action).toBe('needs_manager');
  });

  it('resolves concurrently without random fallbacks', async () => {
    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        resolveTaskAssignee({
          clientId: clientA,
          jobRoleId: roleEditor,
          directory: stubDirectory(),
        }),
      ),
    );

    for (const result of results) {
      expect(result).toEqual({ action: 'assign', employeeId: EDITOR_A, source: 'role_mapping' });
    }
  });
});
