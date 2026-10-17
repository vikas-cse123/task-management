import { z } from 'zod';
import { ACCESS_LEVELS } from '../enums/access-level';
import { USER_STATUSES } from '../enums/user-status';
import { capabilitySchema } from '../permissions/capabilities';
import { phoneE164Schema } from './primitives';

/**
 * Application profile fields added to the Better Auth `user` document.
 *
 * The profile lives on the Better Auth identity (no duplicate identity store);
 * it is provisioned and updated **server-side only** through the Admin API and
 * dedicated services. See `docs/adr/0005-user-profile-on-better-auth-user.md`.
 *
 * This list is the single source of truth for the field names written by the
 * database user-administration service and configured as Better Auth
 * `additionalFields`.
 */
export const APP_USER_ADDITIONAL_FIELDS = [
  'accessLevel',
  'status',
  'jobRoleIds',
  'capabilities',
  'requiresPasswordChange',
  'whatsappNumber',
  'whatsappOptIn',
  'whatsappOptInAt',
  'whatsappOptInSource',
  'createdBy',
] as const;

export type AppUserAdditionalField = (typeof APP_USER_ADDITIONAL_FIELDS)[number];

/**
 * Sanitized application user profile returned by the API.
 *
 * Never contains password hashes, session tokens, or Better Auth internal
 * fields. Timestamps are ISO-8601 strings.
 */
export const userProfileSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  email: z.string(),
  accessLevel: z.enum(ACCESS_LEVELS),
  status: z.enum(USER_STATUSES),
  jobRoleIds: z.array(z.string().min(1)),
  capabilities: z.array(capabilitySchema),
  requiresPasswordChange: z.boolean(),
  whatsappNumber: phoneE164Schema.nullable(),
  whatsappOptIn: z.boolean(),
  whatsappOptInAt: z.string().nullable(),
  whatsappOptInSource: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type UserProfile = z.infer<typeof userProfileSchema>;

/** A user identifier as produced by the identity provider (opaque string). */
export const userIdSchema = z.string().min(1);
