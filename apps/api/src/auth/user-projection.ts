import {
  ACCESS_LEVELS,
  CAPABILITIES,
  DEFAULT_ACCESS_LEVEL,
  DEFAULT_USER_STATUS,
  USER_STATUSES,
  type AccessLevel,
  type Capability,
  type UserProfile,
  type UserStatus,
} from '@interscale/shared';

/** Raw Better Auth user document (fields may be absent on legacy records). */
export interface RawUser {
  id?: unknown;
  name?: unknown;
  email?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
  accessLevel?: unknown;
  status?: unknown;
  jobRoleIds?: unknown;
  capabilities?: unknown;
  requiresPasswordChange?: unknown;
  whatsappNumber?: unknown;
  whatsappOptIn?: unknown;
  whatsappOptInAt?: unknown;
  whatsappOptInSource?: unknown;
}

function asAccessLevel(value: unknown): AccessLevel {
  return typeof value === 'string' && (ACCESS_LEVELS as readonly string[]).includes(value)
    ? (value as AccessLevel)
    : DEFAULT_ACCESS_LEVEL;
}

function asStatus(value: unknown): UserStatus {
  return typeof value === 'string' && (USER_STATUSES as readonly string[]).includes(value)
    ? (value as UserStatus)
    : DEFAULT_USER_STATUS;
}

function asCapabilities(value: unknown): Capability[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(
    (item): item is Capability =>
      typeof item === 'string' && (CAPABILITIES as readonly string[]).includes(item),
  );
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === 'string');
}

function asNullableString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function asIsoString(value: unknown): string {
  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === 'string' && value.length > 0) {
    const parsed = new Date(value);

    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  }

  return new Date(0).toISOString();
}

/**
 * Project a raw Better Auth user onto the sanitized API profile.
 *
 * Never exposes password hashes, session tokens, or internal Better Auth
 * fields. Unknown or missing values fall back to safe defaults rather than
 * leaking a partially-recognized elevation.
 */
export function toUserProfile(user: RawUser): UserProfile {
  return {
    id: typeof user.id === 'string' ? user.id : String(user.id ?? ''),
    name: typeof user.name === 'string' ? user.name : '',
    email: typeof user.email === 'string' ? user.email : '',
    accessLevel: asAccessLevel(user.accessLevel),
    status: asStatus(user.status),
    jobRoleIds: asStringArray(user.jobRoleIds),
    capabilities: asCapabilities(user.capabilities),
    requiresPasswordChange: user.requiresPasswordChange === true,
    whatsappNumber: asNullableString(user.whatsappNumber),
    whatsappOptIn: user.whatsappOptIn === true,
    whatsappOptInAt: asNullableString(user.whatsappOptInAt),
    whatsappOptInSource: asNullableString(user.whatsappOptInSource),
    createdAt: asIsoString(user.createdAt),
    updatedAt: asIsoString(user.updatedAt),
  };
}
