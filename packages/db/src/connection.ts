import mongoose from 'mongoose';

export { mongoose };

/**
 * Establish the shared Mongoose connection used by both the API and the worker.
 */
export async function connectToDatabase(uri: string): Promise<mongoose.Connection> {
  if (typeof uri !== 'string' || uri.trim().length === 0) {
    throw new Error('A MongoDB connection string is required.');
  }

  mongoose.set('strictQuery', true);

  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 10_000,
  });

  return mongoose.connection;
}

export async function disconnectFromDatabase(): Promise<void> {
  await mongoose.disconnect();
}

/** The active global Mongoose connection. */
export function getConnection(): mongoose.Connection {
  return mongoose.connection;
}

export type TransactionWork<T> = (session: mongoose.ClientSession) => Promise<T>;

/**
 * Run `work` inside a MongoDB transaction.
 *
 * Multi-document transactions require a replica-set-compatible deployment
 * (a replica set or sharded cluster). Standalone servers raise a driver error,
 * which is surfaced to the caller rather than being masked.
 */
export async function withTransaction<T>(
  work: TransactionWork<T>,
  options: { connection?: mongoose.Connection } = {},
): Promise<T> {
  const connection = options.connection ?? mongoose.connection;
  const session = await connection.startSession();

  try {
    return await session.withTransaction(() => work(session));
  } finally {
    await session.endSession();
  }
}
