import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';
import { DEFAULT_TIMEZONE } from './constants';

/**
 * Date/time contracts for meeting scheduling (Phase 6).
 *
 * The application is used by a single team in India, so there is **no
 * per-user timezone selection**: Asia/Kolkata is the fixed application
 * timezone. Timestamps are always stored in MongoDB as UTC; these helpers
 * convert between a wall-clock date/time in the display timezone and the UTC
 * instant, and format UTC instants for display.
 *
 * Display conventions (Phase 6 requirement):
 * - dates as `DD/MM/YYYY`;
 * - times as 12-hour `hh:mm AM/PM`.
 *
 * Conversions are runtime-timezone independent: `fromZonedTime` interprets the
 * supplied wall time in the target zone regardless of the machine's local
 * timezone, so browser input never drifts.
 */

export const IST_TIME_ZONE = DEFAULT_TIMEZONE;

export const DISPLAY_DATE_FORMAT = 'dd/MM/yyyy';
export const DISPLAY_TIME_FORMAT = 'hh:mm a';
export const DISPLAY_DATE_TIME_FORMAT = `${DISPLAY_DATE_FORMAT} ${DISPLAY_TIME_FORMAT}`;

/** `YYYY-MM-DD` calendar date (used for date inputs and IST day queries). */
export const CALENDAR_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** 24-hour `HH:mm` clock time (the value a time input submits). */
export const CLOCK_TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Whether a string is a valid IANA timezone identifier. */
export function isValidTimeZone(timeZone: string): boolean {
  if (typeof timeZone !== 'string' || timeZone.trim().length === 0) {
    return false;
  }

  try {
    new Intl.DateTimeFormat('en-US', { timeZone }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

/**
 * Whether `YYYY-MM-DD` is a real calendar date.
 *
 * Rejects values that JavaScript would silently normalize such as `2026-02-31`.
 */
export function isCalendarDate(value: string): boolean {
  if (!CALENDAR_DATE_PATTERN.test(value)) {
    return false;
  }

  const [year, month, day] = value.split('-').map((part) => Number.parseInt(part, 10));
  const probe = new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1));

  return (
    probe.getUTCFullYear() === year &&
    probe.getUTCMonth() === (month ?? 1) - 1 &&
    probe.getUTCDate() === day
  );
}

/** Whether a string is a valid 24-hour `HH:mm` clock time. */
export function isClockTime(value: string): boolean {
  return CLOCK_TIME_PATTERN.test(value);
}

/**
 * Convert a wall-clock date and time in `timeZone` to the UTC instant.
 *
 * Throws a `RangeError` for an invalid calendar date, clock time, or timezone.
 * `date` is `YYYY-MM-DD`, `time` is 24-hour `HH:mm`.
 */
export function zonedDateTimeToUtc(
  date: string,
  time: string,
  timeZone: string = IST_TIME_ZONE,
): Date {
  if (!isCalendarDate(date) || !isClockTime(time) || !isValidTimeZone(timeZone)) {
    throw new RangeError('A valid date, time and timezone are required');
  }

  const instant = fromZonedTime(`${date}T${time}:00`, timeZone);

  if (Number.isNaN(instant.getTime())) {
    throw new RangeError('Unable to resolve the given date and time in the timezone');
  }

  return instant;
}

/** Format a UTC instant (Date or ISO string) in `timeZone`. */
export function formatZonedDateTime(
  value: Date | string,
  formatStr: string = DISPLAY_DATE_TIME_FORMAT,
  timeZone: string = IST_TIME_ZONE,
): string {
  const date = typeof value === 'string' ? new Date(value) : value;

  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return formatInTimeZone(date, timeZone, formatStr);
}

/** Display the date portion of a UTC instant as `DD/MM/YYYY`. */
export function formatZonedDate(value: Date | string, timeZone: string = IST_TIME_ZONE): string {
  return formatZonedDateTime(value, DISPLAY_DATE_FORMAT, timeZone);
}

/** Display the time portion of a UTC instant as `hh:mm AM/PM`. */
export function formatZonedTime(value: Date | string, timeZone: string = IST_TIME_ZONE): string {
  return formatZonedDateTime(value, DISPLAY_TIME_FORMAT, timeZone);
}

/** The `YYYY-MM-DD` calendar date that a UTC instant falls on in `timeZone`. */
export function zonedCalendarDate(value: Date | string, timeZone: string = IST_TIME_ZONE): string {
  return formatZonedDateTime(value, 'yyyy-MM-dd', timeZone);
}

/**
 * The inclusive UTC window covering one calendar day (`YYYY-MM-DD`) in
 * `timeZone`. Used for date filtering of meetings.
 */
export function zonedDayRangeUtc(
  date: string,
  timeZone: string = IST_TIME_ZONE,
): { start: Date; end: Date } {
  const start = zonedDateTimeToUtc(date, '00:00', timeZone);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);

  return { start, end };
}
