import { DEFAULT_ACCESS_LEVEL, DEFAULT_USER_STATUS } from '@interscale/shared';
import type { BetterAuthOptions } from 'better-auth';

type UserAdditionalFieldsConfig = NonNullable<
  NonNullable<BetterAuthOptions['user']>['additionalFields']
>;

/**
 * Additional fields stored on the Better Auth `user` document.
 *
 * The application profile lives on the identity itself (no duplicate identity
 * store — see `docs/adr/0005-user-profile-on-better-auth-user.md`). Every field
 * is `input: false`: clients can never set an access level, status, capability
 * or job-role assignment. Values are written only server-side through the Admin
 * API, the bootstrap script, or the user-administration service.
 *
 * Field names are mirrored by `APP_USER_ADDITIONAL_FIELDS` in `@interscale/shared`.
 */
export const userAdditionalFields: UserAdditionalFieldsConfig = {
  accessLevel: {
    type: 'string',
    required: false,
    input: false,
    defaultValue: DEFAULT_ACCESS_LEVEL,
    index: true,
  },
  status: {
    type: 'string',
    required: false,
    input: false,
    defaultValue: DEFAULT_USER_STATUS,
    index: true,
  },
  jobRoleIds: {
    type: 'string[]',
    required: false,
    input: false,
    defaultValue: [],
  },
  capabilities: {
    type: 'string[]',
    required: false,
    input: false,
    defaultValue: [],
  },
  requiresPasswordChange: {
    type: 'boolean',
    required: false,
    input: false,
    defaultValue: false,
  },
  whatsappNumber: {
    type: 'string',
    required: false,
    input: false,
    defaultValue: null,
  },
  whatsappOptIn: {
    type: 'boolean',
    required: false,
    input: false,
    defaultValue: false,
  },
  whatsappOptInAt: {
    type: 'date',
    required: false,
    input: false,
    defaultValue: null,
  },
  whatsappOptInSource: {
    type: 'string',
    required: false,
    input: false,
    defaultValue: null,
  },
  createdBy: {
    type: 'string',
    required: false,
    input: false,
    defaultValue: null,
  },
};
