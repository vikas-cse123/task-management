import {
  AUTH_BASE_PATH,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  type AccessLevel,
  type Capability,
  type UserStatus,
} from '@interscale/shared';
import { mongodbAdapter } from '@better-auth/mongo-adapter';
import { APIError, betterAuth, type BetterAuthOptions, type DBAdapterInstance } from 'better-auth';
import { admin } from 'better-auth/plugins';
import { env } from '../config/env';
import { userAdditionalFields } from './user-fields';

/**
 * Admin-plugin HTTP paths.
 *
 * Every account-administration endpoint is blocked at the **library level** so
 * it is impossible to reach through HTTP, regardless of what the frontend
 * renders. Server-side `auth.api.*` calls (used by the Admin API and the
 * bootstrap script) bypass the HTTP router and remain available.
 *
 * `disabledPaths` performs an exact match against the path relative to the
 * Better Auth base path, so each endpoint must be listed explicitly.
 */
export const DISABLED_ADMIN_PATHS = [
  '/admin/ban-user',
  '/admin/create-user',
  '/admin/get-user',
  '/admin/has-permission',
  '/admin/impersonate-user',
  '/admin/list-users',
  '/admin/list-user-sessions',
  '/admin/remove-user',
  '/admin/revoke-user-session',
  '/admin/revoke-user-sessions',
  '/admin/set-role',
  '/admin/set-user-password',
  '/admin/stop-impersonating',
  '/admin/unban-user',
  '/admin/update-user',
] as const;

export { AUTH_BASE_PATH };

type MongoAdapterDb = Parameters<typeof mongodbAdapter>[0];
type MongoAdapterConfig = NonNullable<Parameters<typeof mongodbAdapter>[1]>;
type MongoClientInstance = MongoAdapterConfig['client'];

export interface CreateAuthOptions {
  /** MongoDB database handle. Required unless `adapter` is supplied. */
  database?: MongoAdapterDb;
  /** MongoDB client. Required for adapter transactions. */
  client?: MongoClientInstance;
  /**
   * Whether the deployment supports multi-document transactions. Defaults to
   * `true` when a client is supplied; set `false` for a standalone server.
   */
  transactions?: boolean;
  /** Adapter override, used by tests (for example the in-memory adapter). */
  adapter?: DBAdapterInstance;
  /** Deterministic id generation override (tests). */
  generateId?: (props: { model: string }) => string;
  /** Explicit secret (defaults to `BETTER_AUTH_SECRET`). */
  secret?: string;
  /** Explicit base URL (defaults to `BETTER_AUTH_URL`). */
  baseURL?: string;
  /** Trusted browser origins (defaults to `WEB_ORIGIN`). */
  trustedOrigins?: string[];
  /** Force-enable rate limiting regardless of environment (tests). */
  enableRateLimit?: boolean;
}

function resolveTrustedOrigins(override?: string[]): string[] {
  if (override) {
    return override;
  }

  return (env.WEB_ORIGIN ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}

/**
 * Build the Better Auth instance.
 *
 * Security choices (docs/02-authentication.md):
 * - email + password only, public sign-up disabled at the library level;
 * - `disabledPaths` blocks every admin-plugin HTTP route;
 * - inactive accounts are refused a session before it is created;
 * - cookie-cache is disabled so deactivation and revocation take effect
 *   immediately on the next request;
 * - trusted origins + rate limiting on sensitive routes.
 */
export function createAuth(options: CreateAuthOptions = {}) {
  const database =
    options.adapter ??
    (options.database
      ? mongodbAdapter(
          options.database,
          options.client
            ? options.transactions === false
              ? { client: options.client, transaction: false }
              : { client: options.client }
            : { transaction: false },
        )
      : undefined);

  return betterAuth({
    appName: 'Interscale Project & Team Management',
    secret: options.secret ?? env.BETTER_AUTH_SECRET,
    baseURL: options.baseURL ?? env.BETTER_AUTH_URL ?? `http://${env.API_HOST}:${env.API_PORT}`,
    basePath: AUTH_BASE_PATH,
    database,
    trustedOrigins: resolveTrustedOrigins(options.trustedOrigins),
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      minPasswordLength: PASSWORD_MIN_LENGTH,
      maxPasswordLength: PASSWORD_MAX_LENGTH,
      requireEmailVerification: false,
    },
    user: {
      additionalFields: userAdditionalFields,
      changeEmail: { enabled: false },
    },
    session: {
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 24,
      cookieCache: { enabled: false },
    },
    databaseHooks: {
      session: {
        create: {
          before: async (session, context) => {
            if (!context) {
              return;
            }

            const user = await context.context.internalAdapter.findUserById(session.userId);

            if (user && (user as { status?: UserStatus }).status === 'inactive') {
              throw APIError.from('FORBIDDEN', {
                message: 'This account is inactive',
                code: 'ACCOUNT_INACTIVE',
              });
            }
          },
        },
      },
    },
    rateLimit: {
      enabled: options.enableRateLimit ?? env.NODE_ENV === 'production',
      window: 60,
      max: 100,
      customRules: {
        '/sign-in/email': { window: 60, max: 5 },
        '/change-password': { window: 60, max: 10 },
      },
    },
    advanced: {
      ...(options.generateId ? { database: { generateId: options.generateId } } : {}),
      useSecureCookies: env.NODE_ENV === 'production',
      defaultCookieAttributes: {
        httpOnly: true,
        sameSite: 'lax',
        secure: env.NODE_ENV === 'production',
      },
    },
    plugins: [admin()],
    disabledPaths: [...DISABLED_ADMIN_PATHS],
  });
}

export type Auth = ReturnType<typeof createAuth>;

/** Fields guaranteed to be present on the additional user profile. */
export interface AppUserProfileFields {
  accessLevel: AccessLevel;
  status: UserStatus;
  jobRoleIds: string[];
  capabilities: Capability[];
  requiresPasswordChange: boolean;
  whatsappNumber: string | null;
  whatsappOptIn: boolean;
  whatsappOptInAt: Date | string | null;
  whatsappOptInSource: string | null;
  createdBy: string | null;
}

export type { BetterAuthOptions };
