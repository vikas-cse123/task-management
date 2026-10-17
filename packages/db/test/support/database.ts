import mongoose from 'mongoose';
import {
  AuditLogModel,
  ClientModel,
  ClientRoleAssignmentModel,
  ClientTeamMemberModel,
  DepartmentModel,
  JobRoleModel,
  ProjectModel,
  TaskActivityModel,
  TaskModel,
} from '../../src';
import { hasTestDatabase } from './flags';

const TEST_MONGODB_URI = process.env.TEST_MONGODB_URI?.trim() ?? '';

let databaseCounter = 0;

/** A unique, isolated database name so parallel test files never collide. */
export function uniqueDatabaseName(label: string): string {
  databaseCounter += 1;
  return `interscale_pm_test_${label}_${process.pid}_${Date.now()}_${databaseCounter}`;
}

function buildConnectionString(uri: string, databaseName: string): string {
  const url = new URL(uri);
  url.pathname = `/${databaseName}`;
  return url.toString();
}

/** Connect the global Mongoose instance to a fresh, isolated test database. */
export async function connectTestDatabase(label: string): Promise<string> {
  if (!hasTestDatabase) {
    throw new Error('TEST_MONGODB_URI is not configured.');
  }

  const databaseName = uniqueDatabaseName(label);
  await mongoose.connect(buildConnectionString(TEST_MONGODB_URI, databaseName), {
    serverSelectionTimeoutMS: 10_000,
  });
  return databaseName;
}

/** Create the indexes declared by every Phase 1 model. */
export async function ensureIndexes(): Promise<void> {
  await Promise.all([
    AuditLogModel.createIndexes(),
    ClientModel.createIndexes(),
    ClientRoleAssignmentModel.createIndexes(),
    ClientTeamMemberModel.createIndexes(),
    DepartmentModel.createIndexes(),
    JobRoleModel.createIndexes(),
    ProjectModel.createIndexes(),
    TaskActivityModel.createIndexes(),
    TaskModel.createIndexes(),
  ]);
}

/** Remove all documents without dropping indexes. */
export async function clearTestDatabase(): Promise<void> {
  await Promise.all(
    Object.values(mongoose.connection.collections).map((collection) => collection.deleteMany({})),
  );
}

/** Drop the isolated test database and close the connection. */
export async function disconnectTestDatabase(): Promise<void> {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
}
