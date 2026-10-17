import { describe, expect, it } from 'vitest';
import { addDaysAtIst, formatIstDate } from '../src/lib/deadlines';

/**
 * Calendar-day deadline arithmetic (Asia/Kolkata, UTC+05:30).
 *
 * These are pure and run without a database.
 */
describe('deadline calculation (Asia/Kolkata)', () => {
  it('returns the same IST calendar day at the configured local time', () => {
    // 2026-01-05T00:00:00Z is 2026-01-05 05:30 IST.
    const base = new Date('2026-01-05T00:00:00.000Z');
    const due = addDaysAtIst(base, 0, '09:00');

    // 09:00 IST == 03:30 UTC.
    expect(due.toISOString()).toBe('2026-01-05T03:30:00.000Z');
  });

  it('adds calendar days without weekend assumptions', () => {
    const base = new Date('2026-01-05T00:00:00.000Z');
    const due = addDaysAtIst(base, 3, '09:00');

    expect(formatIstDate(due)).toBe('2026-01-08');
    expect(due.toISOString()).toBe('2026-01-08T03:30:00.000Z');
  });

  it('crosses month boundaries correctly', () => {
    const base = new Date('2026-01-30T00:00:00.000Z');
    const due = addDaysAtIst(base, 3, '18:00');

    expect(formatIstDate(due)).toBe('2026-02-02');
    expect(due.toISOString()).toBe('2026-02-02T12:30:00.000Z');
  });

  it('treats a UTC instant late in the day as the next IST calendar day', () => {
    // 2026-01-05T20:00:00Z is 2026-01-06 01:30 IST.
    const base = new Date('2026-01-05T20:00:00.000Z');
    const due = addDaysAtIst(base, 0, '09:00');

    expect(formatIstDate(due)).toBe('2026-01-06');
  });
});
