/**
 * Project templates (Phase 4, docs/07-development-phases.md).
 *
 * A template is an Admin-managed, reusable definition of a whole project
 * workflow: task/subtask nodes plus prerequisite edges. Templates are versioned
 * and bound to exactly one client only at instantiation time, never in the
 * definition itself.
 *
 * All values are stable internal identifiers. Display labels live next to the
 * enums so the UI never hardcodes strings.
 */
import type { ProjectType } from './project-type';

export const TEMPLATE_TYPES = ['campaign', 'onboarding', 'general'] as const;

export type TemplateType = (typeof TEMPLATE_TYPES)[number];

export const DEFAULT_TEMPLATE_TYPE: TemplateType = 'general';

export const TEMPLATE_TYPE_LABELS: Record<TemplateType, string> = {
  campaign: 'Campaign',
  onboarding: 'Onboarding',
  general: 'General',
};

/**
 * Template-level lifecycle status.
 *
 * `draft` — editable; `published` — has at least one immutable published
 * version; `archived` — retired, hidden from project creation, kept for history.
 */
export const TEMPLATE_STATUSES = ['draft', 'published', 'archived'] as const;

export type TemplateStatus = (typeof TEMPLATE_STATUSES)[number];

export const DEFAULT_TEMPLATE_STATUS: TemplateStatus = 'draft';

export const TEMPLATE_STATUS_LABELS: Record<TemplateStatus, string> = {
  draft: 'Draft',
  published: 'Published',
  archived: 'Archived',
};

/**
 * Per-version lifecycle status.
 *
 * `draft` — the single editable working copy; `published` — immutable and
 * selectable for project creation (at most one per template); `archived` —
 * superseded or template-archived, retained for historical reference.
 */
export const TEMPLATE_VERSION_STATUSES = ['draft', 'published', 'archived'] as const;

export type TemplateVersionStatus = (typeof TEMPLATE_VERSION_STATUSES)[number];

/**
 * How a node's approver is resolved at instantiation.
 *
 * `project_manager` — the project's authorized Project Manager (they already
 * hold Manager access, so approval authority is never granted to an employee
 * without it); `none` — approval is not required for this node.
 */
export const TEMPLATE_APPROVER_RULES = ['project_manager', 'none'] as const;

export type TemplateApproverRule = (typeof TEMPLATE_APPROVER_RULES)[number];

export const DEFAULT_TEMPLATE_APPROVER_RULE: TemplateApproverRule = 'none';

/** How a node's assignee is resolved at instantiation (docs/00 §6.1). */
export const TEMPLATE_ASSIGNMENT_RULES = ['designated', 'project_manager', 'none'] as const;

export type TemplateAssignmentRule = (typeof TEMPLATE_ASSIGNMENT_RULES)[number];

export const DEFAULT_TEMPLATE_ASSIGNMENT_RULE: TemplateAssignmentRule = 'designated';

/** Base date a node's relative deadline is measured from. */
export const DEADLINE_ANCHORS = ['project_start', 'project_target'] as const;

export type DeadlineAnchor = (typeof DEADLINE_ANCHORS)[number];

export const DEFAULT_DEADLINE_ANCHOR: DeadlineAnchor = 'project_start';

/** Default display timezone (UTC+05:30, no DST). Timestamps are stored in UTC. */
export const DEFAULT_TEMPLATE_TIMEZONE = 'Asia/Kolkata';

/** Default local time of day for a calendar-day deadline rule. */
export const DEFAULT_DEADLINE_TIME_OF_DAY = '09:00';

/**
 * Substitution variables supported in node titles/descriptions.
 *
 * `adIndex` resolves to the 1-based advertisement number inside a repeat group
 * (blank when the group has a single instance). No other placeholders are
 * allowed; validation rejects unknown or malformed variables.
 */
export const TEMPLATE_VARIABLE_KEYS = [
  'clientName',
  'destination',
  'campaignName',
  'projectName',
  'projectStartDate',
  'projectTargetDate',
  'adIndex',
] as const;

export type TemplateVariableKey = (typeof TEMPLATE_VARIABLE_KEYS)[number];

/** Which project type a template of each type produces. */
export const TEMPLATE_TYPE_TO_PROJECT_TYPE: Record<TemplateType, ProjectType> = {
  campaign: 'campaign',
  onboarding: 'onboarding',
  general: 'general',
};

/** Upper bound for repeated creative groups (e.g. number of video ads). */
export const MAX_REPEAT_INSTANCES = 20;
