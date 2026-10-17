import { DEFAULT_TIMEZONE } from '@interscale/shared';

/**
 * Meeting date/time display helpers (Phase 6, Step 35).
 *
 * Dates render `DD/MM/YYYY` and times use the 12-hour clock with AM/PM, always
 * in the agency timezone (Asia/Kolkata). Storage remains UTC ISO timestamps.
 */

function toDate(value: string | null): Date | null {
  if (!value) {
    return null;
  }

  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? null : date;
}

/** Format an ISO timestamp as `DD/MM/YYYY` in the agency timezone. */
export function formatMeetingDate(value: string | null): string {
  const date = toDate(value);

  if (!date) {
    return '—';
  }

  return date.toLocaleDateString('en-IN', {
    timeZone: DEFAULT_TIMEZONE,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

/** Format an ISO timestamp as `hh:mm AM/PM` in the agency timezone. */
export function formatMeetingTime(value: string | null): string {
  const date = toDate(value);

  if (!date) {
    return '—';
  }

  return date
    .toLocaleTimeString('en-IN', {
      timeZone: DEFAULT_TIMEZONE,
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    })
    .toUpperCase();
}

/** Format a start/end pair as `DD/MM/YYYY · hh:mm AM – hh:mm AM`. */
export function formatMeetingRange(startsAt: string, endsAt: string): string {
  return `${formatMeetingDate(startsAt)} · ${formatMeetingTime(startsAt)} – ${formatMeetingTime(endsAt)}`;
}

/** Today's calendar date (`YYYY-MM-DD`) in the agency timezone. */
export function todayIst(): string {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: DEFAULT_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);

  return parts;
}

/** Add (or subtract) whole days to a `YYYY-MM-DD` calendar date. */
export function addDays(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number);
  const next = new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1));
  next.setUTCDate(next.getUTCDate() + days);

  return next.toISOString().slice(0, 10);
}

/** UTC ISO range covering whole IST calendar days `[fromDate, toDate]`. */
export function istRangeBounds(fromDate: string, toDate: string): { from: string; to: string } {
  return {
    from: new Date(`${fromDate}T00:00:00+05:30`).toISOString(),
    to: new Date(`${addDays(toDate, 1)}T00:00:00+05:30`).toISOString(),
  };
}
