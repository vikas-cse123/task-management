import { connectToDatabase, disconnectFromDatabase, mongoose } from '@interscale/db';
import { createApp } from './app';
import { createAuth } from './auth/auth';
import { env } from './config/env';
import { logger } from './lib/logger';

async function detectTransactionsSupport(
  database: NonNullable<typeof mongoose.connection.db>,
): Promise<boolean> {
  try {
    const hello = (await database.admin().command({ hello: 1 })) as {
      setName?: string;
      msg?: string;
    };

    return typeof hello.setName === 'string' || hello.msg === 'isdbgrid';
  } catch (error) {
    logger.warn({ err: error }, 'Could not determine MongoDB transaction support');
    return false;
  }
}

async function main(): Promise<void> {
  if (!env.MONGODB_URI) {
    throw new Error('MONGODB_URI is required to start the API.');
  }

  if (!env.BETTER_AUTH_SECRET) {
    throw new Error('BETTER_AUTH_SECRET is required to start the API.');
  }

  await connectToDatabase(env.MONGODB_URI);

  const database = mongoose.connection.db;

  if (!database) {
    throw new Error('The MongoDB connection did not expose a database handle.');
  }

  const transactions = await detectTransactionsSupport(database);
  const auth = createAuth({
    database,
    client: mongoose.connection.getClient(),
    transactions,
  });

  const app = createApp({ auth });

  const server = app.listen(env.API_PORT, env.API_HOST, () => {
    logger.info(
      { host: env.API_HOST, port: env.API_PORT, env: env.NODE_ENV, transactions },
      'Interscale API listening',
    );
  });

  const shutdown = (signal: string): void => {
    logger.info({ signal }, 'Shutting down API');
    server.close(() => {
      void disconnectFromDatabase().finally(() => {
        logger.info('API closed');
        process.exit(0);
      });
    });
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((error: unknown) => {
  logger.fatal({ err: error }, 'API failed to start');
  process.exit(1);
});
