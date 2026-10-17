/**
 * Calendar-day deadline arithmetic for template nodes (Phase 4, Step 19.8).
 *
 * The display timezone is Asia/Kolkata (UTC+05:30, fixed — no DST). Timestamps
 * are stored in UTC. A relative rule means "N calendar days after the anchor
 * date, at the configured local time", with no weekend/holiday assumptions.
 */
const IST_OFFSET_MINUTES = 330;
const MS_PER_MINUTE = 60_000;

interface CalendarParts {
  year: number;
  month: number;
  day: number;
}

/** The IST calendar date that a UTC instant falls on. */
function istCalendarParts(base: Date): CalendarParts {
  const shifted = new Date(base.getTime() + IST_OFFSET_MINUTES * MS_PER_MINUTE);

  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth(),
    day: shifted.getUTCDate(),
  };
}

/**
 * Add `offsetDays` calendar days to `base` (measured in IST) and return the UTC
 * instant for `timeOfDay` (local `HH:mm`) on the resulting day.
 */
export function addDaysAtIst(base: Date, offsetDays: number, timeOfDay: string): Date {
  const { year, month, day } = istCalendarParts(base);
  const [hours, minutes] = timeOfDay.split(':').map((part) => Number.parseInt(part, 10));
  const utcMs =
    Date.UTC(year, month, day + offsetDays, hours ?? 9, minutes ?? 0, 0, 0) -
    IST_OFFSET_MINUTES * MS_PER_MINUTE;

  return new Date(utcMs);
}

/** Format a UTC instant as its IST calendar date (`YYYY-MM-DD`). */
export function formatIstDate(date: Date): string {
  const { year, month, day } = istCalendarParts(date);
  const paddedMonth = String(month + 1).padStart(2, '0');
  const paddedDay = String(day).padStart(2, '0');

  return `${year}-${paddedMonth}-${paddedDay}`;
}
