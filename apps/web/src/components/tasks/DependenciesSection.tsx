import { TASK_STATUS_LABELS } from '@interscale/shared';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { TextField } from '../ui/TextField';
import { useProjectTasks } from '../../hooks/useTasks';
import {
  useAddDependency,
  useAssignmentCandidate,
  useBlockers,
  useDependents,
  usePrerequisites,
  useRemoveDependency,
  useResolveAssignment,
  useResolveReview,
  useReviews,
} from '../../hooks/useTasks';
import { errorMessage } from '../../lib/api';

/** Dependency graph, blockers and reviews for one task (Step 17). */
export function DependenciesSection({
  taskId,
  projectId,
  canManage,
}: {
  taskId: string;
  projectId: string;
  canManage: boolean;
}) {
  const prereqs = usePrerequisites(taskId);
  const dependents = useDependents(taskId);
  const blockers = useBlockers(taskId);
  const reviews = useReviews(taskId);
  const candidates = useProjectTasks(projectId);

  const addDependency = useAddDependency(taskId);
  const removeDependency = useRemoveDependency(taskId);
  const resolveReview = useResolveReview(taskId);

  const [formError, setFormError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<{ id: string; title: string } | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [removeReason, setRemoveReason] = useState('');
  const [resolveNote, setResolveNote] = useState('');
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const existingIds = new Set((prereqs.data ?? []).map((link) => link.taskId));
  const options = (candidates.data ?? []).filter(
    (task) => task.id !== taskId && !existingIds.has(task.id),
  );

  const handleAdd = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setFormError(null);

    if (!selected) {
      setFormError('Select a prerequisite task first.');
      return;
    }

    try {
      await addDependency.mutateAsync(selected.id);
      setSelected(null);
      setSearch('');
    } catch (error) {
      setFormError(errorMessage(error));
    }
  };

  const handleRemove = async (): Promise<void> => {
    if (!removingId || removeReason.trim().length === 0) {
      return;
    }

    setActionError(null);

    try {
      await removeDependency.mutateAsync({ dependencyId: removingId, reason: removeReason.trim() });
      setRemovingId(null);
      setRemoveReason('');
    } catch (error) {
      setActionError(errorMessage(error));
    }
  };

  const handleResolve = async (reviewId: string): Promise<void> => {
    if (resolveNote.trim().length === 0) {
      return;
    }

    setActionError(null);

    try {
      await resolveReview.mutateAsync({ reviewId, note: resolveNote.trim() });
      setResolvingId(null);
      setResolveNote('');
    } catch (error) {
      setActionError(errorMessage(error));
    }
  };

  return (
    <section className="space-y-4">
      <h2 className="text-sm font-semibold">Dependencies</h2>

      {blockers.isPending ? (
        <p className="text-sm text-slate-500">Evaluating blockers…</p>
      ) : blockers.isError ? (
        <p className="text-sm text-red-600">{errorMessage(blockers.error)}</p>
      ) : (
        <BlockerBanner blockers={blockers.data} />
      )}

      {actionError ? <p className="text-sm text-red-600">{actionError}</p> : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-2 rounded-lg border border-slate-200 bg-white p-4">
          <h3 className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
            Prerequisites
          </h3>
          {prereqs.isPending ? (
            <p className="text-sm text-slate-500">Loading…</p>
          ) : (prereqs.data ?? []).length === 0 ? (
            <p className="text-sm text-slate-500">
              No prerequisites. This work can start on its own.
            </p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {(prereqs.data ?? []).map((link) => (
                <li
                  key={link.dependencyId}
                  className="flex items-center justify-between gap-2 py-2"
                >
                  <div>
                    <Link
                      to={`/tasks/${link.taskId}`}
                      className="text-sm font-medium text-slate-900 hover:underline"
                    >
                      {link.title}
                    </Link>
                    <p className="text-xs text-slate-500">
                      {TASK_STATUS_LABELS[link.status as keyof typeof TASK_STATUS_LABELS] ??
                        link.status}
                    </p>
                  </div>
                  {canManage ? (
                    <button
                      type="button"
                      onClick={() => {
                        setRemovingId(link.dependencyId);
                        setRemoveReason('');
                        setActionError(null);
                      }}
                      className="rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                    >
                      Remove
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}

          {removingId ? (
            <div className="grid gap-2 border-t border-slate-100 pt-2">
              <TextField
                label="Removal reason (required)"
                name="remove-reason"
                value={removeReason}
                onChange={(event) => setRemoveReason(event.target.value)}
                placeholder="Why is this prerequisite no longer needed?"
                maxLength={2000}
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={removeDependency.isPending || removeReason.trim().length === 0}
                  onClick={() => void handleRemove()}
                  className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-slate-700 disabled:opacity-60"
                >
                  Confirm removal
                </button>
                <button
                  type="button"
                  onClick={() => setRemovingId(null)}
                  className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : null}

          {canManage ? (
            <form onSubmit={handleAdd} className="grid gap-2 border-t border-slate-100 pt-2">
              <div className="space-y-1">
                <label htmlFor="dep-search" className="block text-sm font-medium text-slate-700">
                  Add prerequisite (same project only)
                </label>
                <input
                  id="dep-search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search tasks in this project…"
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
                />
              </div>
              {selected ? (
                <p className="text-sm text-slate-700">
                  Selected: <span className="font-medium">{selected.title}</span>{' '}
                  <button
                    type="button"
                    onClick={() => setSelected(null)}
                    className="text-xs text-slate-500 underline"
                  >
                    Clear
                  </button>
                </p>
              ) : search.trim().length > 0 ? (
                <ul className="divide-y divide-slate-100 rounded-md border border-slate-200">
                  {options
                    .filter((task) =>
                      task.title.toLowerCase().includes(search.trim().toLowerCase()),
                    )
                    .slice(0, 8)
                    .map((task) => (
                      <li
                        key={task.id}
                        className="flex items-center justify-between gap-2 px-3 py-2"
                      >
                        <span className="text-sm">
                          {task.parentTaskId ? '↳ ' : ''}
                          {task.title}{' '}
                          <span className="text-xs text-slate-400">({task.status})</span>
                        </span>
                        <button
                          type="button"
                          onClick={() => setSelected({ id: task.id, title: task.title })}
                          className="shrink-0 rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                        >
                          Select
                        </button>
                      </li>
                    ))}
                </ul>
              ) : null}
              {formError ? <p className="text-sm text-red-600">{formError}</p> : null}
              <button
                type="submit"
                disabled={addDependency.isPending || !selected}
                className="w-fit rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-slate-700 disabled:opacity-60"
              >
                {addDependency.isPending ? 'Adding…' : 'Add dependency'}
              </button>
            </form>
          ) : null}
        </div>

        <div className="space-y-2 rounded-lg border border-slate-200 bg-white p-4">
          <h3 className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
            Downstream dependents
          </h3>
          {dependents.isPending ? (
            <p className="text-sm text-slate-500">Loading…</p>
          ) : (dependents.data ?? []).length === 0 ? (
            <p className="text-sm text-slate-500">Nothing waits on this work.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {(dependents.data ?? []).map((link) => (
                <li key={link.dependencyId} className="py-2">
                  <Link
                    to={`/tasks/${link.taskId}`}
                    className="text-sm font-medium text-slate-900 hover:underline"
                  >
                    {link.title}
                  </Link>
                  <p className="text-xs text-slate-500">
                    {TASK_STATUS_LABELS[link.status as keyof typeof TASK_STATUS_LABELS] ??
                      link.status}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="space-y-2 rounded-lg border border-slate-200 bg-white p-4">
        <h3 className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
          Dependency reviews
        </h3>
        {reviews.isPending ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : (reviews.data ?? []).length === 0 ? (
          <p className="text-sm text-slate-500">No review flags on this task.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {(reviews.data ?? []).map((review) => (
              <li key={review.id} className="space-y-1 py-2">
                <p className="text-sm text-slate-900">
                  <span
                    className={`mr-2 inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                      review.status === 'open'
                        ? 'bg-amber-100 text-amber-800'
                        : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {review.status === 'open' ? 'Dependency Review Required' : 'Resolved'}
                  </span>
                  {review.reason}
                </p>
                {review.status === 'resolved' ? (
                  <p className="text-xs text-slate-500">
                    Resolved{review.resolutionNote ? `: ${review.resolutionNote}` : ''}
                  </p>
                ) : canManage ? (
                  resolvingId === review.id ? (
                    <div className="grid max-w-xl gap-2">
                      <TextField
                        label="Resolution decision (required)"
                        name={`resolve-${review.id}`}
                        value={resolveNote}
                        onChange={(event) => setResolveNote(event.target.value)}
                        placeholder="What was decided and why?"
                        maxLength={2000}
                      />
                      <div className="flex gap-2">
                        <button
                          type="button"
                          disabled={resolveReview.isPending || resolveNote.trim().length === 0}
                          onClick={() => void handleResolve(review.id)}
                          className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-slate-700 disabled:opacity-60"
                        >
                          Resolve
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setResolvingId(null);
                            setResolveNote('');
                          }}
                          className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setResolvingId(review.id);
                        setResolveNote('');
                        setActionError(null);
                      }}
                      className="rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                    >
                      Resolve review
                    </button>
                  )
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>

      {canManage && blockers.data?.needsAssignment ? (
        <NeedsAssignmentPanel taskId={taskId} />
      ) : null}
    </section>
  );
}

function BlockerBanner({
  blockers,
}: {
  blockers:
    | {
        isBlocked: boolean;
        manualReason: string | null;
        waitingOn: { title: string; status: string }[];
        needsAssignment: boolean;
        reviewOpen: boolean;
      }
    | undefined;
}) {
  if (!blockers) {
    return null;
  }

  const lines: string[] = [];

  if (blockers.manualReason) {
    lines.push(`Manually blocked: ${blockers.manualReason}.`);
  }

  if (blockers.waitingOn.length === 1) {
    lines.push(`Waiting on ${blockers.waitingOn[0]?.title} (${blockers.waitingOn[0]?.status}).`);
  } else if (blockers.waitingOn.length > 1) {
    lines.push(`Waiting on ${blockers.waitingOn.length} prerequisite tasks.`);
  }

  if (blockers.needsAssignment) {
    lines.push('Employee assignment required.');
  }

  if (blockers.reviewOpen) {
    lines.push('Dependency review required.');
  }

  if (lines.length === 0) {
    return (
      <p
        role="status"
        className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900"
      >
        Ready to start: no blockers detected.
      </p>
    );
  }

  return (
    <div
      role="status"
      className="space-y-1 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900"
    >
      {lines.map((line) => (
        <p key={line}>{line}</p>
      ))}
    </div>
  );
}

function NeedsAssignmentPanel({ taskId }: { taskId: string }) {
  const candidate = useAssignmentCandidate(taskId);
  const resolveAssignment = useResolveAssignment(taskId);
  const [error, setError] = useState<string | null>(null);

  const handleResolve = async (): Promise<void> => {
    setError(null);

    try {
      await resolveAssignment.mutateAsync();
    } catch (caught) {
      setError(errorMessage(caught));
    }
  };

  return (
    <div className="space-y-2 rounded-lg border border-dashed border-slate-300 bg-white p-4">
      <h3 className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
        Needs Assignment
      </h3>
      {candidate.isPending ? (
        <p className="text-sm text-slate-500">Checking the client role mapping…</p>
      ) : candidate.isError ? (
        <p className="text-sm text-red-600">{errorMessage(candidate.error)}</p>
      ) : candidate.data?.action === 'assign' ? (
        <div className="space-y-2">
          <p className="text-sm text-slate-700">
            The client mapping suggests an eligible employee. Apply it, or assign manually from the
            Assignment section.
          </p>
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <button
            type="button"
            disabled={resolveAssignment.isPending}
            onClick={() => void handleResolve()}
            className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-slate-700 disabled:opacity-60"
          >
            {resolveAssignment.isPending ? 'Assigning…' : 'Assign suggested employee'}
          </button>
        </div>
      ) : (
        <p className="text-sm text-slate-700">
          {candidate.data?.reason ?? 'No eligible employee found.'} A Manager must choose an
          eligible employee manually.
        </p>
      )}
    </div>
  );
}
