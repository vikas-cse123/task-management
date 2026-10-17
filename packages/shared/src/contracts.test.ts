import { describe, expect, it } from 'vitest';
import { ACCESS_LEVELS, API_PREFIX, DEPARTMENT_KEYS, JOB_ROLE_KEYS } from './index';

describe('shared contracts', () => {
  it('defines exactly three application access levels', () => {
    expect(ACCESS_LEVELS).toEqual(['Admin', 'Manager', 'Employee']);
  });

  it('defines the four seeded departments', () => {
    expect(DEPARTMENT_KEYS).toHaveLength(4);
  });

  it('defines the six functional job roles', () => {
    expect(JOB_ROLE_KEYS).toHaveLength(6);
  });

  it('exposes the versioned api prefix', () => {
    expect(API_PREFIX).toBe('/api/v1');
  });
});
