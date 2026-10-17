import type { ClientStatus } from '@interscale/shared';
import type { Schema } from 'mongoose';
import { describe, expect, it } from 'vitest';
import {
  AuditLogModel,
  ClientModel,
  ClientRoleAssignmentModel,
  ClientTeamMemberModel,
  DepartmentModel,
  JobRoleModel,
} from '../src';

type IndexEntry = [
  Record<string, unknown>,
  { unique?: boolean; name?: string; partialFilterExpression?: Record<string, unknown> },
];

function indexesOf(schema: Schema): IndexEntry[] {
  return schema.indexes() as IndexEntry[];
}

function findIndex(
  schema: Schema,
  predicate: (fields: Record<string, unknown>) => boolean,
): IndexEntry | undefined {
  return indexesOf(schema).find(([fields]) => predicate(fields));
}

describe('phase 1 model schemas', () => {
  it('requires a stable unique key on departments', () => {
    const entry = findIndex(DepartmentModel.schema, (fields) => fields['key'] === 1);
    expect(entry).toBeDefined();
    expect(entry?.[1].unique).toBe(true);
    expect(DepartmentModel.schema.path('key').isRequired).toBe(true);
  });

  it('requires a stable unique key and a department on job roles', () => {
    const entry = findIndex(JobRoleModel.schema, (fields) => fields['key'] === 1);
    expect(entry?.[1].unique).toBe(true);
    expect(JobRoleModel.schema.path('departmentId').isRequired).toBe(true);
  });

  it('enforces a unique client name and defaults the client status', () => {
    const entry = findIndex(ClientModel.schema, (fields) => fields['name'] === 1);
    expect(entry?.[1].unique).toBe(true);

    const defaults = (ClientModel.schema.path('status') as unknown as { defaultValue?: unknown })
      .defaultValue;
    expect(defaults).toBe('active');
  });

  it('enforces one team membership per client/user pair', () => {
    const entry = findIndex(
      ClientTeamMemberModel.schema,
      (fields) => fields['clientId'] === 1 && fields['userId'] === 1,
    );
    expect(entry?.[1].unique).toBe(true);
  });

  it('enforces one active primary designated employee per client and job role', () => {
    const entry = indexesOf(ClientRoleAssignmentModel.schema).find(
      ([, options]) => options.name === 'uniq_active_primary_per_client_role',
    );
    expect(entry).toBeDefined();
    expect(entry?.[1].unique).toBe(true);
    expect(entry?.[1].partialFilterExpression).toEqual({ isActive: true, isPrimary: true });

    const uniquePair = findIndex(
      ClientRoleAssignmentModel.schema,
      (fields) => fields['clientId'] === 1 && fields['jobRoleId'] === 1 && fields['userId'] === 1,
    );
    expect(uniquePair?.[1].unique).toBe(true);
  });

  it('indexes audit logs by entity and actor', () => {
    const byEntity = findIndex(
      AuditLogModel.schema,
      (fields) => fields['entityType'] === 1 && fields['entityId'] === 1,
    );
    const byActor = findIndex(AuditLogModel.schema, (fields) => fields['actorId'] === 1);
    expect(byEntity).toBeDefined();
    expect(byActor).toBeDefined();
  });

  it('rejects values outside the declared enums', async () => {
    await expect(
      new DepartmentModel({ key: 'not_a_department', name: 'Bad' }).validate(),
    ).rejects.toThrow();

    const invalidStatus = 'archived' as ClientStatus;
    await expect(
      new ClientModel({ name: 'Travel Enfield', status: invalidStatus }).validate(),
    ).rejects.toThrow();
  });
});
