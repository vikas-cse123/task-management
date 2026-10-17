import { resolve } from 'node:path';
import { config as loadEnv } from 'dotenv';
import { connectToDatabase, disconnectFromDatabase } from '../connection';
import { seedReferenceData } from './reference-data';

loadEnv({
  path: [
    resolve(process.cwd(), '.env'),
    resolve(process.cwd(), '../../.env'),
    resolve(process.cwd(), '../../../.env'),
  ],
});

async function main(): Promise<void> {
  const uri = process.env.MONGODB_URI?.trim();

  if (!uri) {
    throw new Error('MONGODB_URI is required to seed reference data.');
  }

  await connectToDatabase(uri);

  try {
    const summary = await seedReferenceData();
    console.log(
      `Reference data seeded: ${summary.departments} departments, ${summary.jobRoles} job roles.`,
    );
  } finally {
    await disconnectFromDatabase();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
