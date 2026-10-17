import { TASK_PRIORITIES, TASK_PRIORITY_LABELS, type TaskPriority } from '@interscale/shared';
import { useState, type FormEvent } from 'react';
import { TextField } from '../ui/TextField';
import { fromDateTimeLocal } from '../../lib/dates';

export interface TaskFormValues {
  title: string;
  description: string;
  assignedUserId: string;
  assignedJobRoleId: string;
  dueAt: string;
  priority: string;
  approvalRequired: boolean;
  approverId: string;
  sopUrl: string;
  referenceUrl: string;
}

export interface TaskFormSubmit {
  title: string;
  description: string | null;
  assignedUserId: string | null;
  assignedJobRoleId: string | null;
  dueAt: string | null;
  priority: TaskPriority;
  approvalRequired: boolean;
  approverId: string | null;
  sopUrl: string | null;
  referenceUrl: string | null;
  autoAssign: boolean;
}

interface TaskFormProps {
  jobRoles: { id: string; name: string }[];
  employees: { id: string; name: string; email: string }[] | null;
  submitLabel: string;
  submitting: boolean;
  error: string | null;
  confirmCompletedParent?: boolean;
  onSubmit: (values: TaskFormSubmit, confirmCompletedParent: boolean) => void;
  onCancel: () => void;
}

function emptyToNull(value: string): string | null {
  return value.trim().length > 0 ? value.trim() : null;
}

/** Shared create form for tasks and subtasks (Steps 8–9). */
export function TaskForm({
  jobRoles,
  employees,
  submitLabel,
  submitting,
  error,
  confirmCompletedParent,
  onSubmit,
  onCancel,
}: TaskFormProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [assignedUserId, setAssignedUserId] = useState('');
  const [assignedJobRoleId, setAssignedJobRoleId] = useState('');
  const [dueAt, setDueAt] = useState('');
  const [priority, setPriority] = useState<TaskPriority>('medium');
  const [approvalRequired, setApprovalRequired] = useState(false);
  const [approverId, setApproverId] = useState('');
  const [sopUrl, setSopUrl] = useState('');
  const [referenceUrl, setReferenceUrl] = useState('');
  const [autoAssign, setAutoAssign] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();

    onSubmit(
      {
        title: title.trim(),
        description: emptyToNull(description),
        assignedUserId: assignedUserId === '' ? null : assignedUserId,
        assignedJobRoleId: assignedJobRoleId === '' ? null : assignedJobRoleId,
        dueAt: fromDateTimeLocal(dueAt),
        priority,
        approvalRequired,
        approverId: approverId.trim() === '' ? null : approverId.trim(),
        sopUrl: emptyToNull(sopUrl),
        referenceUrl: emptyToNull(referenceUrl),
        autoAssign,
      },
      confirmed,
    );
  };

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      className="grid max-w-2xl gap-3 rounded-lg border border-slate-200 bg-white p-4"
    >
      <TextField
        label="Title"
        name="title"
        required
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        maxLength={200}
      />
      <TextField
        label="Description"
        name="description"
        value={description}
        onChange={(event) => setDescription(event.target.value)}
        maxLength={2000}
      />

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <label htmlFor="task-role" className="block text-sm font-medium text-slate-700">
            Functional job role
          </label>
          <select
            id="task-role"
            value={assignedJobRoleId}
            onChange={(event) => setAssignedJobRoleId(event.target.value)}
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
          >
            <option value="">Select role…</option>
            {jobRoles.map((role) => (
              <option key={role.id} value={role.id}>
                {role.name}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <label htmlFor="task-assignee" className="block text-sm font-medium text-slate-700">
            Assigned employee
          </label>
          {employees ? (
            <select
              id="task-assignee"
              value={assignedUserId}
              onChange={(event) => setAssignedUserId(event.target.value)}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
            >
              <option value="">Unassigned (needs assignment)</option>
              {employees.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.name} ({employee.email})
                </option>
              ))}
            </select>
          ) : (
            <input
              id="task-assignee"
              value={assignedUserId}
              onChange={(event) => setAssignedUserId(event.target.value)}
              placeholder="User id, empty when unassigned"
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
            />
          )}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <TextField
          label="Due date and time"
          name="dueAt"
          type="datetime-local"
          value={dueAt}
          onChange={(event) => setDueAt(event.target.value)}
        />
        <div className="space-y-1">
          <label htmlFor="task-priority" className="block text-sm font-medium text-slate-700">
            Priority
          </label>
          <select
            id="task-priority"
            value={priority}
            onChange={(event) => setPriority(event.target.value as TaskPriority)}
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
          >
            {TASK_PRIORITIES.map((value) => (
              <option key={value} value={value}>
                {TASK_PRIORITY_LABELS[value]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <label className="inline-flex items-center gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={approvalRequired}
          onChange={(event) => setApprovalRequired(event.target.checked)}
          className="h-4 w-4"
        />
        Approval required before completion
      </label>

      {approvalRequired ? (
        <TextField
          label="Designated approver user id"
          name="approverId"
          value={approverId}
          onChange={(event) => setApproverId(event.target.value)}
          placeholder="24-character user id"
          hint="Must be an active member of the client team."
        />
      ) : null}

      <label className="inline-flex items-center gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={autoAssign}
          onChange={(event) => setAutoAssign(event.target.checked)}
          className="h-4 w-4"
        />
        Auto-assign from the client role mapping when unassigned
      </label>

      <div className="grid gap-3 sm:grid-cols-2">
        <TextField
          label="SOP URL"
          name="sopUrl"
          value={sopUrl}
          onChange={(event) => setSopUrl(event.target.value)}
          placeholder="https://…"
          maxLength={2000}
        />
        <TextField
          label="Reference URL"
          name="referenceUrl"
          value={referenceUrl}
          onChange={(event) => setReferenceUrl(event.target.value)}
          placeholder="https://…"
          maxLength={2000}
        />
      </div>

      {confirmCompletedParent ? (
        <label className="inline-flex items-center gap-2 text-sm text-amber-800">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(event) => setConfirmed(event.target.checked)}
            className="h-4 w-4"
          />
          The parent is completed — I confirm adding this subtask.
        </label>
      ) : null}

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={submitting || title.trim().length === 0}
          className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-slate-700 disabled:opacity-60"
        >
          {submitting ? 'Saving…' : submitLabel}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
