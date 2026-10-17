import { useState } from 'react';
import { Link } from 'react-router-dom';
import { TextField } from '../components/ui/TextField';
import { useApprovalQueue, useTaskFlow } from '../hooks/useTasks';
import { errorMessage } from '../lib/api';
import { formatDateTime } from '../lib/dates';

/** Approval queue: tasks awaiting this user's review (Step 11). */
export function ApprovalsPage() {
  const queue = useApprovalQueue();
  const [revisingId, setRevisingId] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const [actingId, setActingId] = useState<string | null>(null);

  const act = async (
    id: string,
    action: 'approve' | 'revise',
    flow: ReturnType<typeof useTaskFlow>,
  ): Promise<void> => {
    setActionError(null);
    setActingId(id);

    try {
      if (action === 'revise') {
        if (reason.trim().length === 0) {
          setActionError('A revision reason is required.');
          return;
        }

        await flow.mutateAsync({ action, reason: reason.trim() });
        setRevisingId(null);
        setReason('');
      } else {
        await flow.mutateAsync({ action });
      }
    } catch (error) {
      setActionError(errorMessage(error));
    } finally {
      setActingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Approvals</h1>
        <p className="mt-1 text-sm text-slate-500">
          Work submitted for your review. Approve it or request revisions with a reason.
        </p>
      </div>

      {actionError ? <p className="text-sm text-red-600">{actionError}</p> : null}

      {queue.isPending ? (
        <p className="text-sm text-slate-500">Loading approvals…</p>
      ) : queue.isError ? (
        <p className="text-sm text-red-600">{errorMessage(queue.error)}</p>
      ) : (queue.data ?? []).length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-300 bg-white px-4 py-6 text-center text-sm text-slate-500">
          Nothing awaiting your review.
        </p>
      ) : (
        <ul className="space-y-4">
          {(queue.data ?? []).map((row) => (
            <QueueCard
              key={row.id}
              rowId={row.id}
              title={row.parentTitle ? `↳ ${row.title}` : row.title}
              meta={`${row.clientName} · ${row.projectName}`}
              submitted={row.submittedAt}
              due={row.dueAt}
              busy={actingId === row.id}
              revising={revisingId === row.id}
              reason={reason}
              onReasonChange={setReason}
              onApprove={(flow) => void act(row.id, 'approve', flow)}
              onStartRevise={() => {
                setRevisingId(row.id);
                setReason('');
                setActionError(null);
              }}
              onCancelRevise={() => {
                setRevisingId(null);
                setReason('');
              }}
              onConfirmRevise={(flow) => void act(row.id, 'revise', flow)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function QueueCard({
  rowId,
  title,
  meta,
  submitted,
  due,
  busy,
  revising,
  reason,
  onReasonChange,
  onApprove,
  onStartRevise,
  onCancelRevise,
  onConfirmRevise,
}: {
  rowId: string;
  title: string;
  meta: string;
  submitted: string | null;
  due: string | null;
  busy: boolean;
  revising: boolean;
  reason: string;
  onReasonChange: (value: string) => void;
  onApprove: (flow: ReturnType<typeof useTaskFlow>) => void;
  onStartRevise: () => void;
  onCancelRevise: () => void;
  onConfirmRevise: (flow: ReturnType<typeof useTaskFlow>) => void;
}) {
  const flow = useTaskFlow(rowId);

  return (
    <li className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
      <div>
        <Link to={`/tasks/${rowId}`} className="text-sm font-medium text-slate-900 hover:underline">
          {title}
        </Link>
        <p className="text-xs text-slate-500">{meta}</p>
        <p className="text-xs text-slate-500">
          Submitted {submitted ? formatDateTime(submitted) : '—'}
          {due ? ` · Due ${formatDateTime(due)}` : ''}
        </p>
      </div>

      {revising ? (
        <div className="grid max-w-xl gap-2">
          <TextField
            label="Revision reason (required)"
            name={`reason-${rowId}`}
            value={reason}
            onChange={(event) => onReasonChange(event.target.value)}
            placeholder="What must change before approval?"
            maxLength={2000}
          />
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy || reason.trim().length === 0}
              onClick={() => onConfirmRevise(flow)}
              className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-slate-700 disabled:opacity-60"
            >
              {busy ? 'Sending…' : 'Request revision'}
            </button>
            <button
              type="button"
              onClick={onCancelRevise}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="flex gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => onApprove(flow)}
            className="rounded-md bg-emerald-700 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-emerald-600 disabled:opacity-60"
          >
            {busy ? 'Approving…' : 'Approve'}
          </button>
          <button
            type="button"
            onClick={onStartRevise}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            Request revision
          </button>
        </div>
      )}
    </li>
  );
}
