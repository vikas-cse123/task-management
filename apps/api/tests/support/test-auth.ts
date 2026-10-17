import { memoryAdapter, type MemoryDB } from '@better-auth/memory-adapter';
import mongoose from 'mongoose';
import { createAuth, type CreateAuthOptions } from '../../src/auth/auth';
import type { UserAccountWriter } from '../../src/services/user-account';

export const TEST_PASSWORD = 'Sup3r-secret-pw';

export type TestAuth = ReturnType<typeof createAuth>;

export interface TestAuthContext {
  auth: TestAuth;
  /** Raw in-memory store, exposed so tests can simulate out-of-band changes. */
  db: MemoryDB;
}

/**
 * A Better Auth instance backed by the in-memory adapter.
 *
 * Ids are generated as ObjectId hex strings so tests exercise the same
 * identifier shape the MongoDB adapter produces in production. No database is
 * required, so these tests always run (including CI).
 */
export function createTestAuthContext(overrides: Partial<CreateAuthOptions> = {}): TestAuthContext {
  const db: MemoryDB = {
    user: [],
    session: [],
    account: [],
    verification: [],
    rateLimit: [],
  };

  const auth = createAuth({
    adapter: memoryAdapter(db),
    secret: 'test-secret-0123456789abcdef',
    baseURL: 'http://127.0.0.1:4000',
    trustedOrigins: ['http://localhost:5173'],
    generateId: () => new mongoose.Types.ObjectId().toString(),
    enableRateLimit: false,
    ...overrides,
  });

  return { auth, db };
}

export interface CreateTestUserInput {
  email: string;
  name?: string;
  password?: string;
  accessLevel?: 'Admin' | 'Manager' | 'Employee';
  status?: 'active' | 'inactive';
  requiresPasswordChange?: boolean;
  jobRoleIds?: string[];
  capabilities?: string[];
}

/** Provision a user through the same server-side Admin API used in production. */
export async function createTestUser(
  auth: TestAuth,
  input: CreateTestUserInput,
): Promise<{ id: string; email: string }> {
  const result = await auth.api.createUser({
    body: {
      email: input.email,
      password: input.password ?? TEST_PASSWORD,
      name: input.name ?? 'Test User',
      data: {
        accessLevel: input.accessLevel ?? 'Employee',
        status: input.status ?? 'active',
        requiresPasswordChange: input.requiresPasswordChange ?? false,
        jobRoleIds: input.jobRoleIds ?? [],
        capabilities: input.capabilities ?? [],
      },
    },
  });

  return { id: result.user.id, email: result.user.email };
}

/** Simulate an out-of-band status change (for example an Admin deactivation). */
export function setUserStatus(db: MemoryDB, email: string, status: 'active' | 'inactive'): void {
  const users = (db.user ?? []) as Array<Record<string, unknown>>;
  const user = users.find((row) => row.email === email);

  if (!user) {
    throw new Error(`Test user ${email} was not found in the in-memory store`);
  }

  user.status = status;
}

/** In-memory {@link UserAccountWriter} backed by the adapter's store. */
export function createMemoryUserAccountWriter(db: MemoryDB): UserAccountWriter {
  return {
    async setPasswordChangeRequired(userId, required) {
      const users = (db.user ?? []) as Array<Record<string, unknown>>;
      const user = users.find((row) => row.id === userId);

      if (user) {
        user.requiresPasswordChange = required;
      }
    },
    async revokeUserSessions(userId) {
      const sessions = (db.session ?? []) as Array<Record<string, unknown>>;
      const revoked = sessions.filter((row) => row.userId === userId).length;
      db.session = sessions.filter((row) => row.userId !== userId);
      return revoked;
    },
  };
}
