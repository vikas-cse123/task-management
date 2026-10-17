import { z } from 'zod';

/**
 * Role-scoped dashboard summary (Step 11).
 *
 * Every figure is computed live from the database inside the caller's scope:
 * Admins see agency-wide numbers, Managers see their assigned clients, and
 * Employees see only their own work plus assigned-client context. Nothing is
 * fabricated; unauthorized work never leaks through aggregates.
 */
export const dashboardCountSchema = z.object({
  total: z.number().int().min(0),
  active: z.number().int().min(0),
});

export const dashboardTasksSchema = z.object({
  total: z.number().int().min(0),
  dueToday: z.number().int().min(0),
  overdue: z.number().int().min(0),
  blocked: z.number().int().min(0),
  awaitingApproval: z.number().int().min(0),
  done: z.number().int().min(0),
});

export const dashboardWorkloadRowSchema = z.object({
  userId: z.string(),
  name: z.string(),
  email: z.string(),
  open: z.number().int().min(0),
  overdue: z.number().int().min(0),
});

export const dashboardRoleWorkloadRowSchema = z.object({
  jobRoleId: z.string(),
  name: z.string(),
  open: z.number().int().min(0),
  overdue: z.number().int().min(0),
});

export const dashboardSummarySchema = z.object({
  clients: dashboardCountSchema.extend({
    withoutManager: z.number().int().min(0),
  }),
  projects: z.object({
    total: z.number().int().min(0),
    open: z.number().int().min(0),
  }),
  tasks: dashboardTasksSchema,
  myWork: dashboardTasksSchema,
  approvalsPending: z.number().int().min(0),
  workloadByEmployee: z.array(dashboardWorkloadRowSchema),
  workloadByRole: z.array(dashboardRoleWorkloadRowSchema),
});

export type DashboardSummary = z.infer<typeof dashboardSummarySchema>;
