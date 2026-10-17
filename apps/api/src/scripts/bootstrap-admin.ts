import { connectToDatabase, disconnectFromDatabase, mongoose, recordAudit } from '@interscale/db';
import { BETTER_AUTH_USER_COLLECTION } from '@interscale/db';
import { emailSchema, passwordSchema } from '@interscale/shared';
import { z } from 'zod';
import { createAuth } from '../auth/auth';
import { env } from '../config/env';
import { logger } from '../lib/logger';

/**
 * One-time, idempotent initial-Admin bootstrap.
 *
 * Security properties (docs/02-authentication.md §2):
 * - credentials come from server-side environment variables only;
 * - the plaintext password is never logged or sent to the frontend;
 * - rerunning the script never creates a duplicate and never resets an existing
 *   Admin password;
 * - a concurrent duplicate run is tolerated (the second create is rejected and
 *   treated as "already bootstrapped").
 */

const bootstrapEnvSchema = z.object({
  MONGODB_URI: z.string().min(1),
  BETTER_AUTH_SECRET: z.string().min(16),
  INITIAL_ADMIN_EMAIL: emailSchema,
  INITIAL_ADMIN_NAME: z.string().trim().min(1),
  INITIAL_ADMIN_PASSWORD: passwordSchema,
});

async function main(): Promise<void> {
  const parsed = bootstrapEnvSchema.safeParse({
    MONGODB_URI: env.MONGODB_URI,
    BETTER_AUTH_SECRET: env.BETTER_AUTH_SECRET,
    INITIAL_ADMIN_EMAIL: env.INITIAL_ADMIN_EMAIL,
    INITIAL_ADMIN_NAME: env.INITIAL_ADMIN_NAME,
    INITIAL_ADMIN_PASSWORD: env.INITIAL_ADMIN_PASSWORD,
  });

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(
      `Bootstrap environment is incomplete or invalid:\n${issues}\n` +
        'Set INITIAL_ADMIN_EMAIL, INITIAL_ADMIN_NAME and INITIAL_ADMIN_PASSWORD.',
    );
  }

  const { MONGODB_URI, INITIAL_ADMIN_EMAIL, INITIAL_ADMIN_NAME, INITIAL_ADMIN_PASSWORD } =
    parsed.data;

  await connectToDatabase(MONGODB_URI);

  const database = mongoose.connection.db;

  if (!database) {
    throw new Error('The MongoDB connection did not expose a database handle.');
  }

  const hello = (await database.admin().command({ hello: 1 })) as {
    setName?: string;
    msg?: string;
  };
  const transactions = typeof hello.setName === 'string' || hello.msg === 'isdbgrid';

  const auth = createAuth({
    database,
    client: mongoose.connection.getClient(),
    transactions,
  });

  const existing = await database
    .collection(BETTER_AUTH_USER_COLLECTION)
    .findOne({ email: INITIAL_ADMIN_EMAIL });

  if (existing) {
    logger.info(
      { email: INITIAL_ADMIN_EMAIL },
      'Initial Admin already exists; no changes made (safe rerun).',
    );
    return;
  }

  try {
    const created = await auth.api.createUser({
      body: {
        email: INITIAL_ADMIN_EMAIL,
        password: INITIAL_ADMIN_PASSWORD,
        name: INITIAL_ADMIN_NAME,
        data: {
          accessLevel: 'Admin',
          status: 'active',
          requiresPasswordChange: false,
          jobRoleIds: [],
          capabilities: [],
          createdBy: null,
        },
      },
    });

    const userId = created.user.id;

    await recordAudit({
      actorId: null,
      action: 'user.create',
      entityType: 'user',
      entityId: userId,
      previousValue: null,
      newValue: { email: INITIAL_ADMIN_EMAIL, accessLevel: 'Admin', bootstrapped: true },
      notes: 'Initial Admin bootstrap',
    });

    logger.info({ email: INITIAL_ADMIN_EMAIL }, 'Initial Admin created.');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (/already exists|USER_ALREADY_EXISTS/i.test(message)) {
      logger.info(
        { email: INITIAL_ADMIN_EMAIL },
        'Initial Admin was created concurrently; no changes made.',
      );
      return;
    }

    throw error;
  }
}

main()
  .then(async () => {
    await disconnectFromDatabase();
    process.exit(0);
  })
  .catch(async (error: unknown) => {
    logger.error({ err: error }, 'Admin bootstrap failed');
    await disconnectFromDatabase().catch(() => undefined);
    process.exit(1);
  });
