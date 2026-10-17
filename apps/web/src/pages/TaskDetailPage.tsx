import {
  TASK_PRIORITY_LABELS,
  TASK_STATUS_LABELS,
  hasCapability,
  type TaskSummary,
} from '@interscale/shared';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { TaskForm, type TaskFormSubmit } from '../components/tasks/TaskForm';
import { DependenciesSection } from '../components/tasks/DependenciesSection';
import { TextField } from '../components/ui/TextField';
import { useEmployees, useJobRoles } from '../hooks/useEmployees';
import {
  useAssignTask,
  useCreateSubtask,
  useSubtasks,
  useTask,
  useTaskActivity,
  useTaskFlow,
} from '../hooks/useTasks';
import { useSession } from '../hooks/useSession';
import { errorMessage } from '../lib/api';
import { formatDateTime } from '../lib/dates';

/** Task detail with subtasks and activity (Step 9; approval actions in Step 11). */
export function TaskDetailPage() {
  const { id } = useParams();
  const taskId = id ?? '';

  const { user } = useSession();
  const isAdmin = user?.accessLevel === 'Admin';
  const canManage =
    isAdmin === true ||
    hasCapability(user?.accessLevel ?? 'Employee', user?.capabilities, 'clients.manage');

  const task = useTask(taskId);
  const subtasks = useSubtasks(task.data?.parentTaskId ? undefined : taskId);
  const activity = useTaskActivity(taskId);
  const createSubtask = useCreateSubtask(taskId);
  const employees = useEmployees(isAdmin ?? false);
  const jobRoles = useJobRoles();

  const [showForm, setShowForm] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);

  const roleName = (roleId: string | null): string => {
    if (!roleId) {
      return '—';
    }

    return jobRoles.data?.find((role) => role.id === roleId)?.name ?? roleId;
  };

  const employeeName = (userId: string | null): string => {
    if (!userId) {
      return 'Unassigned';
    }

    const found = employees.data?.find((employee) => employee.id === userId);
    return found ? `${found.name} (${found.email})` : userId;
  };

  if (task.isPending) {
    return <p className="text-sm text-slate-500">Loading task…</p>;
  }

  if (task.isError || !task.data) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-red-600">{errorMessage(task.error, 'Task not found.')}</p>
        <Link to="/projects" className="text-sm font-medium text-slate-700 underline">
          Back to projects
        </Link>
      </div>
    );
  }

  const current = task.data;
  const isParent = !current.parentTaskId;

  const handleCreateSubtask = async (
    values: TaskFormSubmit,
    confirmCompletedParent: boolean,
  ): Promise<void> => {
    setFormError(null);
    setWarnings([]);

    try {
      const result = await createSubtask.mutateAsync({
        ...values,
        sourceMeetingId: null,
        confirmCompletedParent,
      });
      setWarnings(result.warnings);
      setShowForm(false);
    } catch (error) {
      setFormError(errorMessage(error));
    }
  };

  return (
    <div className="space-y-8">
      <div>
        {current.parent ? (
          <Link
            to={`/tasks/${current.parent.id}`}
            className="text-xs font-medium text-slate-500 underline"
          >
            ← Parent: {current.parent.title}
          </Link>
        ) : (
          <Link to="/projects" className="text-xs font-medium text-slate-500 underline">
            ← Back to projects
          </Link>
        )}
        <h1 className="mt-1 text-xl font-semibold tracking-tight">{current.title}</h1>
        <p className="mt-1 text-sm text-slate-500">
          {TASK_STATUS_LABELS[current.status]} · Priority {TASK_PRIORITY_LABELS[current.priority]}
          {current.isOverdue ? ' · Overdue' : ''}
          {current.needsAssignment ? ' · Needs Assignment' : ''}
        </p>
        {current.description ? (
          <p className="mt-2 max-w-2xl text-sm text-slate-600">{current.description}</p>
        ) : null}
      </div>

      <dl className="grid max-w-2xl gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-2">
        {(
          [
            ['Assigned to', employeeName(current.assignedUserId)],
            ['Functional role', roleName(current.assignedJobRoleId)],
            ['Due', formatDateTime(current.dueAt)],
            [
              'Approval',
              current.approvalRequired
                ? `Required (${employeeName(current.approverId)})`
                : 'Not required',
            ],
            ['Submitted', current.submittedAt ? formatDateTime(current.submittedAt) : '—'],
            ['Approved', current.approvedAt ? formatDateTime(current.approvedAt) : '—'],
            ['Completed', current.completedAt ? formatDateTime(current.completedAt) : '—'],
            ['Revisions', String(current.revisionCount)],
          ] as Array<[string, string]>
        ).map(([label, value]) => (
          <div key={label}>
            <dt className="text-xs font-medium tracking-wide text-slate-500 uppercase">{label}</dt>
            <dd className="text-sm text-slate-900">{value}</dd>
          </div>
        ))}
        {current.sopUrl ? (
          <div>
            <dt className="text-xs font-medium tracking-wide text-slate-500 uppercase">SOP</dt>
            <dd className="text-sm">
              <a
                href={current.sopUrl}
                target="_blank"
                rel="noreferrer"
                className="text-slate-700 underline"
              >
                Open SOP
              </a>
            </dd>
          </div>
        ) : null}
        {current.referenceUrl ? (
          <div>
            <dt className="text-xs font-medium tracking-wide text-slate-500 uppercase">
              Reference
            </dt>
            <dd className="text-sm">
              <a
                href={current.referenceUrl}
                target="_blank"
                rel="noreferrer"
                className="text-slate-700 underline"
              >
                Open reference
              </a>
            </dd>
          </div>
        ) : null}
      </dl>

      {canManage ? (
        <AssignSection
          taskId={current.id}
          currentUserId={current.assignedUserId}
          currentRoleId={current.assignedJobRoleId}
          employees={isAdmin ? (employees.data ?? null) : null}
          jobRoles={jobRoles.data ?? []}
        />
      ) : null}

      {isParent ? (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">
              Subtasks · {current.progress.completed}/{current.progress.total} (
              {current.progress.percent}%)
            </h2>
            {canManage ? (
              <button
                type="button"
                onClick={() => {
                  setShowForm((value) => !value);
                  setFormError(null);
                }}
                className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-slate-700"
              >
                New subtask
              </button>
            ) : null}
          </div>

          {warnings.map((warning) => (
            <p
              key={warning}
              role="status"
              className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900"
            >
              {warning}
            </p>
          ))}

          {showForm && canManage ? (
            <TaskForm
              jobRoles={jobRoles.data ?? []}
              employees={isAdmin ? (employees.data ?? null) : null}
              submitLabel="Create subtask"
              submitting={createSubtask.isPending}
              error={formError ?? (createSubtask.error ? errorMessage(createSubtask.error) : null)}
              confirmCompletedParent={current.status === 'done' || current.status === 'cancelled'}
              onSubmit={(values, confirmed) => void handleCreateSubtask(values, confirmed)}
              onCancel={() => setShowForm(false)}
            />
          ) : null}

          {subtasks.isPending ? (
            <p className="text-sm text-slate-500">Loading subtasks…</p>
          ) : subtasks.isError ? (
            <p className="text-sm text-red-600">{errorMessage(subtasks.error)}</p>
          ) : (subtasks.data ?? []).length === 0 ? (
            <p className="rounded-lg border border-dashed border-slate-300 bg-white px-4 py-6 text-center text-sm text-slate-500">
              No subtasks yet.
            </p>
          ) : (
            <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
              {(subtasks.data ?? []).map((subtask) => (
                <li key={subtask.id}>
                  <Link
                    to={`/tasks/${subtask.id}`}
                    className="flex items-center justify-between gap-4 px-4 py-3 transition hover:bg-slate-50"
                  >
                    <div>
                      <p className="text-sm font-medium text-slate-900">{subtask.title}</p>
                      <p className="text-xs text-slate-500">
                        {TASK_STATUS_LABELS[subtask.status]} ·{' '}
                        {employeeName(subtask.assignedUserId)}
                        {subtask.dueAt ? ` · Due ${formatDateTime(subtask.dueAt)}` : ''}
                      </p>
                    </div>
                    <span className="text-xs font-medium text-slate-400">Open →</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      <TaskActions
        task={current}
        userId={user?.id ?? ''}
        isAssignee={user?.id === current.assignedUserId}
        isApprover={Boolean(user?.id) && user?.id === current.approverId}
        canManage={canManage}
      />

      <DependenciesSection
        taskId={current.id}
        projectId={current.projectId}
        canManage={canManage}
      />

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Activity</h2>
        {activity.isPending ? (
          <p className="text-sm text-slate-500">Loading activity…</p>
        ) : activity.isError ? (
          <p className="text-sm text-red-600">{errorMessage(activity.error)}</p>
        ) : (activity.data ?? []).length === 0 ? (
          <p className="text-sm text-slate-500">No activity recorded yet.</p>
        ) : (
          <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
            {(activity.data ?? []).map((entry) => (
              <li key={entry.id} className="px-4 py-3">
                <p className="text-sm font-medium text-slate-900">{entry.action}</p>
                <p className="text-xs text-slate-500">
                  {formatDateTime(entry.createdAt)}
                  {entry.notes ? ` · ${entry.notes}` : ''}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

type FlowAction =
  | 'start'
  | 'submit'
  | 'approve'
  | 'complete'
  | 'revise'
  | 'cancel'
  | 'block'
  | 'unblock'
  | 'reopen';

const REASON_ACTIONS: FlowAction[] = ['revise', 'cancel', 'block', 'unblock', 'reopen'];

/** Workflow action buttons permitted for this viewer and task state. */
function TaskActions({
  task,
  userId,
  isAssignee,
  isApprover,
  canManage,
}: {
  task: TaskSummary;
  userId: string;
  isAssignee: boolean;
  isApprover: boolean;
  canManage: boolean;
}) {
  const flow = useTaskFlow(task.id);
  const [pending, setPending] = useState<FlowAction | null>(null);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (!userId) {
    return null;
  }

  const buttons: Array<{ action: FlowAction; label: string; primary?: boolean }> = [];

  if (task.status === 'todo') {
    if (isAssignee || canManage) {
      buttons.push({ action: 'start', label: 'Start work', primary: true });
      buttons.push({ action: 'block', label: 'Mark blocked' });
    }
  }

  if (task.status === 'in_progress') {
    if (isAssignee || canManage) {
      if (task.approvalRequired) {
        buttons.push({ action: 'submit', label: 'Submit for approval', primary: true });
      } else {
        buttons.push({ action: 'complete', label: 'Complete', primary: true });
      }

      buttons.push({ action: 'block', label: 'Mark blocked' });
    }
  }

  if (task.status === 'blocked' && canManage) {
    buttons.push({ action: 'unblock', label: 'Unblock (back to To Do)', primary: true });
  }

  if (task.status === 'awaiting_approval' && isApprover) {
    buttons.push({ action: 'approve', label: 'Approve', primary: true });
    buttons.push({ action: 'revise', label: 'Request revision' });
  }

  if ((task.status === 'done' || task.status === 'cancelled') && canManage) {
    buttons.push({ action: 'reopen', label: 'Reopen' });
  }

  if (
    (task.status === 'todo' ||
      task.status === 'in_progress' ||
      task.status === 'blocked' ||
      task.status === 'awaiting_approval') &&
    canManage
  ) {
    buttons.push({ action: 'cancel', label: 'Cancel task' });
  }

  if (buttons.length === 0) {
    return null;
  }

  const run = async (action: FlowAction): Promise<void> => {
    setError(null);

    if (REASON_ACTIONS.includes(action) && reason.trim().length === 0) {
      setPending(action);
      return;
    }

    try {
      await flow.mutateAsync({ action, reason: reason.trim() || undefined });
      setPending(null);
      setReason('');
    } catch (caught) {
      setError(errorMessage(caught));
    }
  };

  return (
    <section className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
      <h2 className="text-sm font-semibold">Actions</h2>

      <div className="flex flex-wrap gap-2">
        {buttons.map(({ action, label, primary }) => (
          <button
            key={action}
            type="button"
            disabled={flow.isPending}
            onClick={() => void run(action)}
            className={
              primary
                ? 'rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-slate-700 disabled:opacity-60'
                : 'rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60'
            }
          >
            {label}
          </button>
        ))}
      </div>

      {pending ? (
        <div className="grid max-w-xl gap-2">
          <TextField
            label={`Reason (required to ${pending})`}
            name="action-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Explain why"
            maxLength={2000}
          />
          <div className="flex gap-2">
            <button
              type="button"
              disabled={flow.isPending || reason.trim().length === 0}
              onClick={() => void run(pending)}
              className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-slate-700 disabled:opacity-60"
            >
              Confirm
            </button>
            <button
              type="button"
              onClick={() => {
                setPending(null);
                setReason('');
              }}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {(error ?? flow.error) ? (
        <p className="text-sm text-red-600">
          {error ?? (flow.error ? errorMessage(flow.error) : '')}
        </p>
      ) : null}
    </section>
  );
}

/** Reassign the task (Admin / in-scope Manager only; server enforces). */
function AssignSection({
  taskId,
  currentUserId,
  currentRoleId,
  employees,
  jobRoles,
}: {
  taskId: string;
  currentUserId: string | null;
  currentRoleId: string | null;
  employees: { id: string; name: string; email: string }[] | null;
  jobRoles: { id: string; name: string }[];
}) {
  const assign = useAssignTask(taskId);
  const [userId, setUserId] = useState(currentUserId ?? '');
  const [roleId, setRoleId] = useState(currentRoleId ?? '');

  const handleSave = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();

    try {
      await assign.mutateAsync({
        assignedUserId: userId === '' ? null : userId,
        assignedJobRoleId: roleId === '' ? null : roleId,
      });
    } catch {
      // Surfaced via assign.error below.
    }
  };

  return (
    <section className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
      <h2 className="text-sm font-semibold">Assignment</h2>
      <form onSubmit={handleSave} className="grid max-w-xl gap-2 sm:grid-cols-3">
        <div className="space-y-1">
          <label htmlFor="assign-user" className="block text-sm font-medium text-slate-700">
            Employee
          </label>
          {employees ? (
            <select
              id="assign-user"
              value={userId}
              onChange={(event) => setUserId(event.target.value)}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
            >
              <option value="">Unassigned</option>
              {employees.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.name} ({employee.email})
                </option>
              ))}
            </select>
          ) : (
            <input
              id="assign-user"
              value={userId}
              onChange={(event) => setUserId(event.target.value)}
              placeholder="User id"
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
            />
          )}
        </div>
        <div className="space-y-1">
          <label htmlFor="assign-role" className="block text-sm font-medium text-slate-700">
            Job role
          </label>
          <select
            id="assign-role"
            value={roleId}
            onChange={(event) => setRoleId(event.target.value)}
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
          >
            <option value="">None</option>
            {jobRoles.map((role) => (
              <option key={role.id} value={role.id}>
                {role.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-end">
          <button
            type="submit"
            disabled={assign.isPending}
            className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-slate-700 disabled:opacity-60"
          >
            {assign.isPending ? 'Saving…' : 'Save assignment'}
          </button>
        </div>
      </form>
      {assign.error ? <p className="text-sm text-red-600">{errorMessage(assign.error)}</p> : null}
    </section>
  );
}
