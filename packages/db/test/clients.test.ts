import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ClientModel } from '../src';
import type { ClientStatus } from '@interscale/shared';
import {
  clearTestDatabase,
  connectTestDatabase,
  disconnectTestDatabase,
  ensureIndexes,
} from './support/database';
import { hasTestDatabase } from './support/flags';

describe.skipIf(!hasTestDatabase)('client model', () => {
  beforeAll(async () => {
    await connectTestDatabase('clients');
    await ensureIndexes();
  });

  beforeEach(async () => {
    await clearTestDatabase();
  });

  afterAll(async () => {
    await disconnectTestDatabase();
  });

  it('creates a client with an active status and null primary manager by default', async () => {
    const client = await ClientModel.create({ name: 'Travel Enfield' });

    expect(client.status).toBe('active');
    expect(client.primaryManagerId).toBeNull();
    expect(client.createdAt).toBeInstanceOf(Date);
    expect(client.updatedAt).toBeInstanceOf(Date);
  });

  it('rejects a duplicate client name', async () => {
    await ClientModel.create({ name: 'Travel Enfield' });
    await expect(ClientModel.create({ name: 'Travel Enfield' })).rejects.toThrow();
  });

  it('rejects an invalid client status', async () => {
    const invalidStatus = 'archived' as ClientStatus;
    await expect(
      ClientModel.create({ name: 'Goa Holidays', status: invalidStatus }),
    ).rejects.toThrow();
  });

  it('detects concurrent modification through optimistic concurrency', async () => {
    const created = await ClientModel.create({ name: 'Concurrency Co' });

    const first = await ClientModel.findById(created._id);
    const second = await ClientModel.findById(created._id);

    if (!first || !second) {
      throw new Error('Expected to load both client copies');
    }

    first.name = 'Concurrency Co (first)';
    await first.save();

    second.name = 'Concurrency Co (second)';
    await expect(second.save()).rejects.toThrow(/version/i);
  });
});
