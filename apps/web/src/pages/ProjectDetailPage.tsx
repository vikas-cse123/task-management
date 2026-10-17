import {
  PROJECT_STATUSES,
  PROJECT_STATUS_LABELS,
  hasCapability,
  type ProjectStatus,
} from '@interscale/shared';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { TaskForm, type TaskFormSubmit } from '../components/tasks/TaskForm';
import { TextField } from '../components/ui/TextField';
import { useEmployees, useJobRoles } from '../hooks/useEmployees';
import {
  useChangeProjectStatus,
  useProject,
  useProjectActivity,
  useUpdateProject,
} from '../hooks/useProjects';
import { useCreateTask, useProjectTasks } from '../hooks/useTasks';
import { useSession } from '../hooks/useSession';
import { errorMessage } from '../lib/api';
import { formatDateTime } from '../lib/dates';

/** Project workspace: settings, status, manager, activity (Step 7). */
export function ProjectDetailPage() {
  const { id } = useParams();
  const projectId = id ?? '';

  const { user } = useSession();
  const isAdmin = user?.accessLevel === 'Admin';
  const canManage =
    isAdmin === true ||
    hasCapability(user?.accessLevel ?? 'Employee', user?.capabilities, 'clients.manage');

  const project = useProject(projectId);
  const activity = useProjectActivity(projectId);
  const projectTasks = useProjectTasks(projectId);
  const updateProject = useUpdateProject(projectId);
  const changeStatus = useChangeProjectStatus(projectId);
  const createTask = useCreateTask(projectId);
  const employees = useEmployees(isAdmin ?? false);
  const jobRoles = useJobRoles();

  const [name, setName] = useState<string | null>(null);
  const [description, setDescription] = useState<string | null>(null);
  const [managerId, setManagerId] = useState<string | null | undefined>(undefined);
  const [reason, setReason] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [taskFormError, setTaskFormError] = useState<string | null>(null);

  if (project.isPending) {
    return <p className="text-sm text-slate-500">Loading project…</p>;
  }

  if (project.isError || !project.data) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-red-600">{errorMessage(project.error, 'Project not found.')}</p>
        <Link to="/projects" className="text-sm font-medium text-slate-700 underline">
          Back to projects
        </Link>
      </div>
    );
  }

  const handleCreateTask = async (values: TaskFormSubmit): Promise<void> => {
    setTaskFormError(null);

    try {
      await createTask.mutateAsync({
        projectId,
        parentTaskId: null,
        ...values,
        sourceMeetingId: null,
        confirmCompletedParent: false,
      });
      setShowTaskForm(false);
    } catch (error) {
      setTaskFormError(errorMessage(error));
    }
  };

  const current = project.data;
  const draftName = name ?? current.name;
  const draftDescription = description ?? current.description ?? '';
  const draftManager = managerId === undefined ? (current.managerId ?? '') : (managerId ?? '');

  const employeeName = (userId: string): string => {
    const found = employees.data?.find((employee) => employee.id === userId);
    return found ? `${found.name} (${found.email})` : userId;
  };

  const handleSave = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    setActionError(null);

    try {
      await updateProject.mutateAsync({
        name: draftName.trim(),
        description: draftDescription.trim().length > 0 ? draftDescription.trim() : null,
        managerId: draftManager === '' ? null : draftManager,
        expectedVersion: current.version,
      });
      setName(null);
      setDescription(null);
      setManagerId(undefined);
    } catch (error) {
      setActionError(errorMessage(error));
    }
  };

  const handleStatus = async (status: ProjectStatus): Promise<void> => {
    if (status === current.status) {
      return;
    }

    setActionError(null);

    try {
      await changeStatus.mutateAsync({
        status,
        reason: reason.trim().length > 0 ? reason.trim() : undefined,
        expectedVersion: current.version,
      });
      setReason('');
    } catch (error) {
      setActionError(errorMessage(error));
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <Link to="/projects" className="text-xs font-medium text-slate-500 underline">
          ← Back to projects
        </Link>
        <h1 className="mt-1 text-xl font-semibold tracking-tight">{current.name}</h1>
        <p className="mt-1 text-sm text-slate-500">
          {current.type} · {PROJECT_STATUS_LABELS[current.status]}
          {current.managerId
            ? ` · Managed by ${employeeName(current.managerId)}`
            : ' · No manager assigned'}
        </p>
        {current.description ? (
          <p className="mt-2 max-w-2xl text-sm text-slate-600">{current.description}</p>
        ) : null}
      </div>

      {actionError ? <p className="text-sm text-red-600">{actionError}</p> : null}

      <section className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-xs font-medium tracking-wide text-slate-500 uppercase">Leaf tasks</p>
          <p className="mt-1 text-3xl font-semibold">{current.progress.total}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-xs font-medium tracking-wide text-slate-500 uppercase">Completed</p>
          <p className="mt-1 text-3xl font-semibold">{current.progress.completed}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-xs font-medium tracking-wide text-slate-500 uppercase">Progress</p>
          <p className="mt-1 text-3xl font-semibold">{current.progress.percent}%</p>
        </div>
      </section>

      {canManage ? (
        <section className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-semibold">Project settings</h2>
          <form onSubmit={handleSave} className="grid max-w-xl gap-3">
            <TextField
              label="Project name"
              name="name"
              value={draftName}
              onChange={(event) => setName(event.target.value)}
              maxLength={160}
            />
            <TextField
              label="Description"
              name="description"
              value={draftDescription}
              onChange={(event) => setDescription(event.target.value)}
              maxLength={2000}
            />
            <div className="space-y-1">
              <label htmlFor="project-manager" className="block text-sm font-medium text-slate-700">
                Project Manager
              </label>
              {isAdmin && employees.data ? (
                <select
                  id="project-manager"
                  value={draftManager}
                  onChange={(event) => setManagerId(event.target.value || null)}
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
                >
                  <option value="">None</option>
                  {employees.data.map((employee) => (
                    <option key={employee.id} value={employee.id}>
                      {employee.name} ({employee.email})
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  id="project-manager"
                  value={draftManager}
                  onChange={(event) => setManagerId(event.target.value || null)}
                  placeholder="User id, empty for none"
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
                />
              )}
              <p className="text-xs text-slate-500">
                Assigning a manager also activates their client team membership. This never changes
                their access level.
              </p>
            </div>
            {updateProject.error ? (
              <p className="text-sm text-red-600">{errorMessage(updateProject.error)}</p>
            ) : null}
            <button
              type="submit"
              disabled={updateProject.isPending}
              className="w-fit rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-slate-700 disabled:opacity-60"
            >
              {updateProject.isPending ? 'Saving…' : 'Save settings'}
            </button>
          </form>

          <div className="grid max-w-xl gap-2 border-t border-slate-100 pt-3">
            <div className="space-y-1">
              <label htmlFor="project-status" className="block text-sm font-medium text-slate-700">
                Change status (tasks are never affected)
              </label>
              <select
                id="project-status"
                value={current.status}
                onChange={(event) => void handleStatus(event.target.value as ProjectStatus)}
                disabled={changeStatus.isPending}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
              >
                {PROJECT_STATUSES.map((value) => (
                  <option key={value} value={value}>
                    {PROJECT_STATUS_LABELS[value]}
                  </option>
                ))}
              </select>
            </div>
            <TextField
              label="Status reason (optional)"
              name="reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Why is the status changing?"
              maxLength={2000}
            />
            {changeStatus.error ? (
              <p className="text-sm text-red-600">{errorMessage(changeStatus.error)}</p>
            ) : null}
          </div>
        </section>
      ) : null}

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Tasks</h2>{' '}
          {canManage ? (
            <button
              type="button"
              onClick={() => {
                setShowTaskForm((value) => !value);
                setTaskFormError(null);
              }}
              className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-slate-700"
            >
              New task
            </button>
          ) : null}
        </div>

        {(projectTasks.data ?? []).length > 0 ? (
          <p className="text-xs text-slate-500">
            {(projectTasks.data ?? []).filter((task) => task.status === 'blocked').length} blocked
            {' · '}
            {
              (projectTasks.data ?? []).filter((task) => task.status === 'awaiting_approval').length
            }{' '}
            awaiting approval
            {' · '}
            {(projectTasks.data ?? []).filter((task) => task.isOverdue).length} overdue
            {' · '}
            {(projectTasks.data ?? []).filter((task) => task.needsAssignment).length} need
            assignment
          </p>
        ) : null}

        {showTaskForm && canManage ? (
          <TaskForm
            jobRoles={jobRoles.data ?? []}
            employees={isAdmin ? (employees.data ?? null) : null}
            submitLabel="Create task"
            submitting={createTask.isPending}
            error={taskFormError ?? (createTask.error ? errorMessage(createTask.error) : null)}
            onSubmit={(values) => void handleCreateTask(values)}
            onCancel={() => setShowTaskForm(false)}
          />
        ) : null}

        {projectTasks.isPending ? (
          <p className="text-sm text-slate-500">Loading tasks…</p>
        ) : projectTasks.isError ? (
          <p className="text-sm text-red-600">{errorMessage(projectTasks.error)}</p>
        ) : (projectTasks.data ?? []).length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-300 bg-white px-4 py-6 text-center text-sm text-slate-500">
            No tasks yet.
          </p>
        ) : (
          <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
            {(projectTasks.data ?? []).map((task) => (
              <li key={task.id}>
                <Link
                  to={`/tasks/${task.id}`}
                  className="flex items-center justify-between gap-4 px-4 py-3 transition hover:bg-slate-50"
                >
                  <div>
                    <p className="text-sm font-medium text-slate-900">
                      {task.parentTaskId ? '↳ ' : ''}
                      {task.title}
                    </p>
                    <p className="text-xs text-slate-500">
                      {task.status} · {task.priority}
                      {task.dueAt ? ` · Due ${formatDateTime(task.dueAt)}` : ''}
                      {task.needsAssignment ? ' · Needs Assignment' : ''}
                    </p>
                  </div>
                  <span className="text-xs font-medium text-slate-400">Open →</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

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
                  {new Date(entry.createdAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}
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
