import { z } from 'zod';
import type { AccessLevel } from '../enums/access-level';

/**
 * Optional, grantable capabilities.
 *
 * The permission model is: base(accessLevel) + granted(capabilities), always
 * intersected with the user's scope. Capabilities allow optional permissions
 * without introducing additional access levels. Enforcement is always
 * server-side.
 *
 * The full matrix is defined in docs/03-authorization.md.
 */
export const CAPABILITIES = [
  'clients.manage',
  'clients.team.manage',
  'projects.create_from_template',
  'tasks.create_or_reassign',
  'tasks.manage_own_subtasks',
  'meetings.manage',
  'work.approve',
] as const;

export type Capability = (typeof CAPABILITIES)[number];

export const capabilitySchema = z.enum(CAPABILITIES);

/**
 * Capabilities a user receives purely from their application access level.
 *
 * - `Admin` implicitly holds every capability (returned via `hasCapability`).
 * - `Manager` and `Employee` receive no capabilities by default; the Admin must
 *   grant them explicitly.
 *
 * Administrative actions that are *not* expressible as capabilities (managing
 * templates, workspace settings, employee accounts, and access levels) remain
 * Admin-only base permissions.
 */
export const BASE_CAPABILITIES: Record<AccessLevel, readonly Capability[]> = {
  Admin: CAPABILITIES,
  Manager: [],
  Employee: [],
};

/**
 * Determine whether an actor holds a required capability.
 *
 * Admins implicitly hold every capability. Every other access level holds the
 * capability only when it is present in `granted`.
 */
export function hasCapability(
  accessLevel: AccessLevel,
  granted: readonly Capability[] | undefined,
  required: Capability,
): boolean {
  if (accessLevel === 'Admin') {
    return true;
  }

  return granted?.includes(required) ?? false;
}
