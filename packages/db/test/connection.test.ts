import { describe, expect, it } from 'vitest';
import { connectToDatabase } from '../src';

describe('database connection validation', () => {
  it('rejects an empty connection string', async () => {
    await expect(connectToDatabase('')).rejects.toThrow(/required/i);
  });

  it('rejects a malformed connection string', async () => {
    await expect((async () => connectToDatabase('not-a-valid-uri'))()).rejects.toThrow();
  });
});
