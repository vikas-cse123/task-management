import mongoose from 'mongoose';

function withServerSelectionTimeout(uri: string): string {
  const separator = uri.includes('?') ? '&' : '?';
  return `${uri}${separator}serverSelectionTimeoutMS=5000`;
}

/**
 * Determine once whether the configured test MongoDB is replica-set compatible
 * (i.e. supports multi-document transactions) and expose the result to the test
 * workers through the environment.
 */
export default async function globalSetup(): Promise<void> {
  const uri = process.env.TEST_MONGODB_URI?.trim();

  if (!uri) {
    process.env.TEST_MONGODB_TRANSACTIONS = 'false';
    console.warn(
      '[db tests] TEST_MONGODB_URI is not set - database integration tests will be skipped.',
    );
    return;
  }

  const connection = await mongoose.createConnection(withServerSelectionTimeout(uri)).asPromise();

  try {
    const database = connection.db;
    if (!database) {
      throw new Error('Test MongoDB connection did not expose a database handle.');
    }

    const hello = (await database.admin().command({ hello: 1 })) as {
      setName?: string;
      msg?: string;
    };
    const transactional = typeof hello.setName === 'string' || hello.msg === 'isdbgrid';
    process.env.TEST_MONGODB_TRANSACTIONS = transactional ? 'true' : 'false';
    console.log(
      `[db tests] connected to test MongoDB (multi-document transactions: ${
        transactional ? 'supported' : 'unsupported'
      }).`,
    );
  } finally {
    await connection.close();
  }
}
