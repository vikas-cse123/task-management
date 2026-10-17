/**
 * Meeting lifecycle statuses (docs/00-product-requirements.md §10, Phase 6).
 *
 * A meeting is an independent application record — never a task. These are the
 * four approved statuses; no additional status is invented.
 *
 * `rescheduled` is a distinct persisted status that still represents an
 * *active, upcoming* meeting. It is eligible for the one-hour reminder exactly
 * like `scheduled` (see {@link isActiveMeetingStatus}); the reschedule event is
 * recorded in audit/history and tracked by the meeting's `scheduleVersion`.
 */
export const MEETING_STATUSES = ['scheduled', 'rescheduled', 'completed', 'cancelled'] as const;

export type MeetingStatus = (typeof MEETING_STATUSES)[number];

export const DEFAULT_MEETING_STATUS: MeetingStatus = 'scheduled';

export const MEETING_STATUS_LABELS: Record<MeetingStatus, string> = {
  scheduled: 'Scheduled',
  rescheduled: 'Rescheduled',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

/**
 * Statuses whose meeting is still upcoming and therefore reminder-eligible.
 *
 * A rescheduled meeting is still scheduled in practice, so cancellation is the
 * only status that stops future reminders (besides completion).
 */
export const ACTIVE_MEETING_STATUSES: readonly MeetingStatus[] = ['scheduled', 'rescheduled'];

export function isActiveMeetingStatus(status: MeetingStatus): boolean {
  return ACTIVE_MEETING_STATUSES.includes(status);
}

/**
 * Meeting action-item conversion states (Phase 6, Step 33).
 *
 * An action item is a meeting follow-up record, not a task. These two states are
 * action-item indicators only — they are never task statuses. "Needs Assignment"
 * is a derived indicator (a pending item without an assignee), surfaced
 * separately so the UI can highlight it without inventing a status value.
 */
export const MEETING_ACTION_ITEM_STATUSES = ['pending', 'converted'] as const;

export type MeetingActionItemStatus = (typeof MEETING_ACTION_ITEM_STATUSES)[number];

export const DEFAULT_MEETING_ACTION_ITEM_STATUS: MeetingActionItemStatus = 'pending';

export const MEETING_ACTION_ITEM_STATUS_LABELS: Record<MeetingActionItemStatus, string> = {
  pending: 'Not Converted',
  converted: 'Converted to Task',
};
