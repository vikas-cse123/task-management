import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  AuditLogModel,
  ClientModel,
  ClientRoleAssignmentModel,
  ClientTeamMemberModel,
  DepartmentModel,
  JobRoleModel,
  NotFoundError,
  ValidationError,
  assignClientRole,
  removeClientRole,
  withTransaction,
} from '../src';
import {
  clearTestDatabase,
  connectTestDatabase,
  disconnectTestDatabase,
  ensureIndexes,
} from './support/database';
import { hasTestDatabase, hasTransactions } from './support/flags';
import { InMemoryEmployeeDirectory } from './support/in-memory-employee-directory';

const ACTIVE_USER = '507f1f77bcf86cd799439011';
const OTHER_USER = '507f1f77bcf86cd799439012';
const INACTIVE_USER = '507f1f77bcf86cd799439013';
const NO_ROLE_USER = '507f1f77bcf86cd799439014';
const UNKNOWN_USER = '507f1f77bcf86cd7994390ff';
const ACTOR = '507f1f77bcf86cd799439015';
const UNKNOWN_ID = '507f1f77bcf86cd7994390aa';

interface Fixtures {
  clientId: string;
  otherClientId: string;
  jobRoleId: string;
  directory: InMemoryEmployeeDirectory;
}

let fixtures: Fixtures;

async function setupFixtures(): Promise<Fixtures> {
  const department = await DepartmentModel.create({
    key: 'creative_production',
    name: 'Creative Production',
  });
  const jobRole = await JobRoleModel.create({
    key: 'video_editor',
    name: 'Video Editor',
    departmentId: department._id,
  });
  const client = await ClientModel.create({ name: 'Travel Enfield' });
  const otherClient = await ClientModel.create({ name: 'Goa Holidays' });

  const jobRoleId = jobRole._id.toString();

  const directory = new InMemoryEmployeeDirectory()
    .add({ id: ACTIVE_USER, status: 'active', jobRoleIds: [jobRoleId] })
    .add({ id: OTHER_USER, status: 'active', jobRoleIds: [jobRoleId] })
    .add({ id: INACTIVE_USER, status: 'inactive', jobRoleIds: [jobRoleId] })
    .add({ id: NO_ROLE_USER, status: 'active', jobRoleIds: [] });

  return {
    clientId: client._id.toString(),
    otherClientId: otherClient._id.toString(),
    jobRoleId,
    directory,
  };
}

describe.skipIf(!hasTestDatabase)('client role assignments', () => {
  beforeAll(async () => {
    await connectTestDatabase('role-assignments');
    await ensureIndexes();
  });

  beforeEach(async () => {
    await clearTestDatabase();
    fixtures = await setupFixtures();
  });

  afterAll(async () => {
    await disconnectTestDatabase();
  });

  describe.skipIf(!hasTransactions)('assignClientRole (transactional)', () => {
    it('creates membership, assignment and audit atomically', async () => {
      const result = await assignClientRole(
        {
          clientId: fixtures.clientId,
          jobRoleId: fixtures.jobRoleId,
          userId: ACTIVE_USER,
          isPrimary: true,
          actorId: ACTOR,
        },
        { directory: fixtures.directory },
      );

      expect(result.isPrimary).toBe(true);
      expect(result.isActive).toBe(true);

      const membership = await ClientTeamMemberModel.findOne({
        clientId: fixtures.clientId,
        userId: ACTIVE_USER,
      });
      expect(membership?.isActive).toBe(true);
      expect(membership?.roleInTeam).toBe('member');

      const audits = await AuditLogModel.find({ action: 'client.role.assign' });
      expect(audits).toHaveLength(1);
      expect(audits[0]?.entityId.toString()).toBe(result.assignmentId);
    });

    it('does not duplicate membership when the same employee is assigned twice', async () => {
      const deps = { directory: fixtures.directory };

      await assignClientRole(
        {
          clientId: fixtures.clientId,
          jobRoleId: fixtures.jobRoleId,
          userId: ACTIVE_USER,
          isPrimary: true,
        },
        deps,
      );
      await assignClientRole(
        {
          clientId: fixtures.clientId,
          jobRoleId: fixtures.jobRoleId,
          userId: ACTIVE_USER,
          isPrimary: true,
        },
        deps,
      );

      expect(
        await ClientTeamMemberModel.countDocuments({
          clientId: fixtures.clientId,
          userId: ACTIVE_USER,
        }),
      ).toBe(1);
      expect(await ClientRoleAssignmentModel.countDocuments()).toBe(1);
    });

    it('demotes the previous primary when a new primary is designated', async () => {
      const deps = { directory: fixtures.directory };

      await assignClientRole(
        {
          clientId: fixtures.clientId,
          jobRoleId: fixtures.jobRoleId,
          userId: ACTIVE_USER,
          isPrimary: true,
        },
        deps,
      );
      await assignClientRole(
        {
          clientId: fixtures.clientId,
          jobRoleId: fixtures.jobRoleId,
          userId: OTHER_USER,
          isPrimary: true,
        },
        deps,
      );

      const primaries = await ClientRoleAssignmentModel.find({
        clientId: fixtures.clientId,
        jobRoleId: fixtures.jobRoleId,
        isPrimary: true,
        isActive: true,
      });
      expect(primaries).toHaveLength(1);
      expect(primaries[0]?.userId.toString()).toBe(OTHER_USER);

      const demoted = await ClientRoleAssignmentModel.findOne({
        clientId: fixtures.clientId,
        jobRoleId: fixtures.jobRoleId,
        userId: ACTIVE_USER,
      });
      expect(demoted?.isPrimary).toBe(false);
      expect(demoted?.isActive).toBe(true);
    });

    it('rejects an inactive employee without writing anything', async () => {
      await expect(
        assignClientRole(
          {
            clientId: fixtures.clientId,
            jobRoleId: fixtures.jobRoleId,
            userId: INACTIVE_USER,
            isPrimary: true,
          },
          { directory: fixtures.directory },
        ),
      ).rejects.toBeInstanceOf(ValidationError);

      expect(await ClientTeamMemberModel.countDocuments()).toBe(0);
      expect(await ClientRoleAssignmentModel.countDocuments()).toBe(0);
    });

    it('rejects an employee that does not hold the job role', async () => {
      await expect(
        assignClientRole(
          {
            clientId: fixtures.clientId,
            jobRoleId: fixtures.jobRoleId,
            userId: NO_ROLE_USER,
            isPrimary: true,
          },
          { directory: fixtures.directory },
        ),
      ).rejects.toBeInstanceOf(ValidationError);
    });

    it('rejects an unknown employee', async () => {
      await expect(
        assignClientRole(
          {
            clientId: fixtures.clientId,
            jobRoleId: fixtures.jobRoleId,
            userId: UNKNOWN_USER,
            isPrimary: true,
          },
          { directory: fixtures.directory },
        ),
      ).rejects.toBeInstanceOf(NotFoundError);
    });

    it('rejects an unknown client or job role', async () => {
      await expect(
        assignClientRole(
          {
            clientId: UNKNOWN_ID,
            jobRoleId: fixtures.jobRoleId,
            userId: ACTIVE_USER,
            isPrimary: true,
          },
          { directory: fixtures.directory },
        ),
      ).rejects.toBeInstanceOf(NotFoundError);

      await expect(
        assignClientRole(
          {
            clientId: fixtures.clientId,
            jobRoleId: UNKNOWN_ID,
            userId: ACTIVE_USER,
            isPrimary: true,
          },
          { directory: fixtures.directory },
        ),
      ).rejects.toBeInstanceOf(NotFoundError);
    });

    it('rolls back every write when a later step fails', async () => {
      await expect(
        assignClientRole(
          {
            clientId: fixtures.clientId,
            jobRoleId: fixtures.jobRoleId,
            userId: ACTIVE_USER,
            isPrimary: true,
            actorId: 'not-an-object-id',
          },
          { directory: fixtures.directory },
        ),
      ).rejects.toThrow();

      expect(await ClientTeamMemberModel.countDocuments()).toBe(0);
      expect(await ClientRoleAssignmentModel.countDocuments()).toBe(0);
      expect(await AuditLogModel.countDocuments()).toBe(0);
    });

    it('keeps the existing primary when a non-primary assignment is added', async () => {
      const deps = { directory: fixtures.directory };

      await assignClientRole(
        {
          clientId: fixtures.clientId,
          jobRoleId: fixtures.jobRoleId,
          userId: ACTIVE_USER,
          isPrimary: true,
        },
        deps,
      );
      await assignClientRole(
        {
          clientId: fixtures.clientId,
          jobRoleId: fixtures.jobRoleId,
          userId: OTHER_USER,
          isPrimary: false,
        },
        deps,
      );

      const primaries = await ClientRoleAssignmentModel.find({
        clientId: fixtures.clientId,
        jobRoleId: fixtures.jobRoleId,
        isPrimary: true,
        isActive: true,
      });
      expect(primaries).toHaveLength(1);
      expect(primaries[0]?.userId.toString()).toBe(ACTIVE_USER);
    });

    it('removeClientRole deactivates the assignment and writes an audit entry', async () => {
      const deps = { directory: fixtures.directory };

      await assignClientRole(
        {
          clientId: fixtures.clientId,
          jobRoleId: fixtures.jobRoleId,
          userId: ACTIVE_USER,
          isPrimary: true,
        },
        deps,
      );
      const removed = await removeClientRole(
        {
          clientId: fixtures.clientId,
          jobRoleId: fixtures.jobRoleId,
          userId: ACTIVE_USER,
          actorId: ACTOR,
        },
        deps,
      );

      expect(removed.isActive).toBe(false);
      expect(removed.isPrimary).toBe(false);

      const membership = await ClientTeamMemberModel.findOne({
        clientId: fixtures.clientId,
        userId: ACTIVE_USER,
      });
      expect(membership?.isActive).toBe(true);

      const audits = await AuditLogModel.find({ action: 'client.role.remove' });
      expect(audits).toHaveLength(1);
    });
  });

  describe('transaction helper', () => {
    it.skipIf(!hasTransactions)('rolls back all writes when work throws', async () => {
      await expect(
        withTransaction(async (session) => {
          await ClientTeamMemberModel.create(
            [
              {
                clientId: fixtures.clientId,
                userId: ACTIVE_USER,
                roleInTeam: 'member',
                isActive: true,
              },
            ],
            { session },
          );
          throw new Error('boom');
        }),
      ).rejects.toThrow('boom');

      expect(await ClientTeamMemberModel.countDocuments()).toBe(0);
    });
  });

  describe('indexes', () => {
    it('prevents two active primary assignments for the same client and role', async () => {
      await ClientRoleAssignmentModel.create({
        clientId: fixtures.clientId,
        jobRoleId: fixtures.jobRoleId,
        userId: ACTIVE_USER,
        isPrimary: true,
        isActive: true,
      });

      await expect(
        ClientRoleAssignmentModel.create({
          clientId: fixtures.clientId,
          jobRoleId: fixtures.jobRoleId,
          userId: OTHER_USER,
          isPrimary: true,
          isActive: true,
        }),
      ).rejects.toThrow();
    });

    it('allows multiple non-primary active assignments', async () => {
      await ClientRoleAssignmentModel.create({
        clientId: fixtures.clientId,
        jobRoleId: fixtures.jobRoleId,
        userId: ACTIVE_USER,
        isPrimary: false,
        isActive: true,
      });
      await ClientRoleAssignmentModel.create({
        clientId: fixtures.clientId,
        jobRoleId: fixtures.jobRoleId,
        userId: OTHER_USER,
        isPrimary: false,
        isActive: true,
      });

      expect(
        await ClientRoleAssignmentModel.countDocuments({
          clientId: fixtures.clientId,
          jobRoleId: fixtures.jobRoleId,
        }),
      ).toBe(2);
    });

    it('prevents duplicate client/role/user assignments', async () => {
      await ClientRoleAssignmentModel.create({
        clientId: fixtures.clientId,
        jobRoleId: fixtures.jobRoleId,
        userId: ACTIVE_USER,
        isPrimary: false,
        isActive: true,
      });

      await expect(
        ClientRoleAssignmentModel.create({
          clientId: fixtures.clientId,
          jobRoleId: fixtures.jobRoleId,
          userId: ACTIVE_USER,
          isPrimary: false,
          isActive: true,
        }),
      ).rejects.toThrow();
    });

    it('prevents duplicate team membership for the same client and user', async () => {
      await ClientTeamMemberModel.create({
        clientId: fixtures.clientId,
        userId: ACTIVE_USER,
        roleInTeam: 'member',
        isActive: true,
      });

      await expect(
        ClientTeamMemberModel.create({
          clientId: fixtures.clientId,
          userId: ACTIVE_USER,
          roleInTeam: 'member',
          isActive: true,
        }),
      ).rejects.toThrow();
    });
  });
});
