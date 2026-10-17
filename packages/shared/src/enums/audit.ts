/**
 * Audit actions recorded for critical changes.
 *
 * Only Phase 1 actions are defined. Later phases (tasks, dependencies,
 * approvals, meetings, notifications) add their own action keys without
 * changing existing ones. Audit records are append-only and sanitized: never
 * store plaintext passwords or secrets.
 */
export const AUDIT_ACTIONS = [
  'user.create',
  'user.update',
  'user.access_level.update',
  'user.job_roles.update',
  'user.capabilities.update',
  'user.status.update',
  'user.sessions.revoke',
  'client.create',
  'client.update',
  'client.team.assign',
  'client.team.activate',
  'client.team.deactivate',
  'client.role.assign',
  'client.role.remove',
  'department.update',
  'job_role.update',
  'project.create',
  'project.update',
  'project.status.update',
  'project.manager.update',
  'task.create',
  'task.update',
  'task.assign',
  'task.block',
  'task.unblock',
  'task.status.update',
  'task.submit',
  'task.approve',
  'task.revise',
  'task.complete',
  'task.cancel',
  'task.reopen',
  'task.dependency.add',
  'task.dependency.remove',
  'task.ready',
  'dependency.review.create',
  'dependency.review.resolve',
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

/** Entity types that can appear on an audit record. */
export const AUDIT_ENTITY_TYPES = [
  'client',
  'client_team_member',
  'client_role_assignment',
  'department',
  'job_role',
  'project',
  'task',
  'task_dependency',
  'dependency_review',
  'workflow_event',
  'user',
] as const;

export type AuditEntityType = (typeof AUDIT_ENTITY_TYPES)[number];
