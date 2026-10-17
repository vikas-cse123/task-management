/**
 * Task workflow statuses (docs/00-product-requirements.md §7.3).
 *
 * Exactly these six — never add Ready, Approved, Rejected, Needs Assignment
 * or Overdue as statuses. Overdue and Needs Assignment are derived flags.
 * Stored as stable internal values; the UI shows the labels.
 */
export const TASK_STATUSES = [
  'blocked',
  'todo',
  'in_progress',
  'awaiting_approval',
  'done',
  'cancelled',
] as const;

export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  blocked: 'Blocked',
  todo: 'To Do',
  in_progress: 'In Progress',
  awaiting_approval: 'Awaiting Approval',
  done: 'Done',
  cancelled: 'Cancelled',
};

export const DEFAULT_TASK_STATUS: TaskStatus = 'todo';

/** Terminal statuses: only the explicit reopen flow can leave them. */
export const TERMINAL_TASK_STATUSES: readonly TaskStatus[] = ['done', 'cancelled'];
