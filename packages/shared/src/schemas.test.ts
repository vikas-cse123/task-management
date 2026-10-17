import { describe, expect, it } from 'vitest';
import {
  API_ERROR_CODES,
  BASE_CAPABILITIES,
  CAPABILITIES,
  CLIENT_STATUSES,
  CLIENT_TEAM_ROLES,
  USER_STATUSES,
  clientRoleAssignmentInputSchema,
  clientTeamMemberInputSchema,
  createClientInputSchema,
  emailSchema,
  hasCapability,
  isValidObjectId,
  objectIdSchema,
  phoneE164Schema,
  updateClientInputSchema,
} from './index';

const OBJECT_ID = '507f1f77bcf86cd799439011';

describe('shared phase 1 contracts', () => {
  it('exposes the two user statuses', () => {
    expect(USER_STATUSES).toEqual(['active', 'inactive']);
  });

  it('exposes client statuses and team roles', () => {
    expect(CLIENT_STATUSES).toContain('active');
    expect(CLIENT_TEAM_ROLES).toEqual(['manager', 'member']);
  });

  it('defines api error codes', () => {
    expect(API_ERROR_CODES).toContain('CONCURRENT_MODIFICATION');
    expect(API_ERROR_CODES).toContain('FORBIDDEN');
  });

  it('grants every capability to admins and none by base to manager/employee', () => {
    expect(BASE_CAPABILITIES.Admin).toHaveLength(CAPABILITIES.length);
    expect(BASE_CAPABILITIES.Manager).toHaveLength(0);
    expect(BASE_CAPABILITIES.Employee).toHaveLength(0);
  });

  it('resolves capabilities from base level plus explicit grants', () => {
    expect(hasCapability('Admin', undefined, 'clients.manage')).toBe(true);
    expect(hasCapability('Manager', undefined, 'clients.manage')).toBe(false);
    expect(hasCapability('Manager', ['clients.manage'], 'clients.manage')).toBe(true);
    expect(hasCapability('Employee', ['clients.manage'], 'clients.manage')).toBe(true);
  });

  it('validates object ids', () => {
    expect(isValidObjectId(OBJECT_ID)).toBe(true);
    expect(isValidObjectId('not-an-id')).toBe(false);
    expect(objectIdSchema.safeParse(OBJECT_ID).success).toBe(true);
    expect(objectIdSchema.safeParse('xyz').success).toBe(false);
  });

  it('normalizes email and validates e164 phone numbers', () => {
    expect(emailSchema.parse('  Admin@Interscale.Local ')).toBe('admin@interscale.local');
    expect(phoneE164Schema.parse(' +919876543210 ')).toBe('+919876543210');
    expect(phoneE164Schema.safeParse('9876543210').success).toBe(false);
  });

  it('applies defaults when creating a client', () => {
    const parsed = createClientInputSchema.parse({ name: 'Travel Enfield' });
    expect(parsed.status).toBe('active');
    expect(parsed.name).toBe('Travel Enfield');
  });

  it('requires at least one field when updating a client', () => {
    expect(updateClientInputSchema.safeParse({}).success).toBe(false);
    expect(updateClientInputSchema.safeParse({ status: 'inactive' }).success).toBe(true);
  });

  it('defaults client team member and role assignment inputs', () => {
    const member = clientTeamMemberInputSchema.parse({ userId: OBJECT_ID });
    expect(member.roleInTeam).toBe('member');
    expect(member.isActive).toBe(true);

    const assignment = clientRoleAssignmentInputSchema.parse({
      jobRoleId: OBJECT_ID,
      userId: OBJECT_ID,
    });
    expect(assignment.isPrimary).toBe(false);
  });
});
