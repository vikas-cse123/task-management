/**
 * Task priorities.
 *
 * No priority convention was finalized in the approved requirements, so this
 * documents the default set: Low, Medium, High, Urgent.
 */
export const TASK_PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const;

export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export const TASK_PRIORITY_LABELS: Record<TaskPriority, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  urgent: 'Urgent',
};

export const DEFAULT_TASK_PRIORITY: TaskPriority = 'medium';
