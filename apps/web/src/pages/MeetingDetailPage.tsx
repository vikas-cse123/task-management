import {
  DEFAULT_TIMEZONE,
  MEETING_ACTION_ITEM_STATUS_LABELS,
  MEETING_STATUS_LABELS,
  TASK_PRIORITIES,
  TASK_PRIORITY_LABELS,
  hasCapability,
  type MeetingActionItemWithTask,
  type UserProfile,
} from '@interscale/shared';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Modal } from '../components/ui/Modal';
import { TextField } from '../components/ui/TextField';
import { useClientTeam } from '../hooks/useClients';
import { useEmployees, useJobRoles } from '../hooks/useEmployees';
import {
  useCancelMeeting,
  useCompleteMeeting,
  useConvertMeetingActionItem,
  useCreateMeetingActionItem,
  useDeleteMeetingActionItem,
  useMeeting,
  useMeetingActionItems,
  useMeetingHistory,
  useRescheduleMeeting,
  useUpdateMeeting,
  useUpdateMeetingActionItem,
} from '../hooks/useMeetings';
import { useClientProjects } from '../hooks/useProjects';
import { useSession } from '../hooks/useSession';
import { errorMessage } from '../lib/api';
import { formatMeetingDate, formatMeetingRange, formatMeetingTime } from '../lib/meeting-dates';

function canManageMeetings(user: UserProfile | null): boolean {
  if (!user) {
    return false;
  }

  return hasCapability(user.accessLevel, user.capabilities, 'meetings.manage');
}

function participantName(
  userId: string,
  attendeeNames: Array<{ userId: string; name: string }>,
  ownerName: string | null,
  ownerUserId: string,
): string {
  if (userId === ownerUserId) {
    return ownerName ?? userId;
  }

  return attendeeNames.find((entry) => entry.userId === userId)?.name ?? userId;
}

/** Meeting detail: overview, notes, decisions, action items and history (Step 35.6). */
export function MeetingDetailPage() {
  const { id } = useParams();
  const meetingId = id ?? '';
  const { user } = useSession();
  const isAdmin = user?.accessLevel === 'Admin';
  const canManage = canManageMeetings(user);

  const meeting = useMeeting(meetingId);
  const actionItems = useMeetingActionItems(meetingId);
  const history = useMeetingHistory(meetingId);

  const [dialog, setDialog] = useState<
    'edit' | 'reschedule' | 'cancel' | 'complete' | 'notes' | 'decisions' | 'action-item' | null
  >(null);
  const [editingItem, setEditingItem] = useState<MeetingActionItemWithTask | null>(null);
  const [convertingItem, setConvertingItem] = useState<MeetingActionItemWithTask | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const detail = meeting.data;
  const team = useClientTeam(detail?.clientId);
  const employees = useEmployees(isAdmin ?? false);
  const jobRoles = useJobRoles();

  const employeeLabel = (userId: string): string => {
    const employee = employees.data?.find((item) => item.id === userId);

    if (employee) {
      return `${employee.name} (${employee.email})`;
    }

    if (user && user.id === userId) {
      return `${user.name} (you)`;
    }

    return userId;
  };

  if (meeting.isPending) {
    return <p className="text-sm text-slate-500">Loading meeting…</p>;
  }

  if (meeting.isError || !detail) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-red-600">{errorMessage(meeting.error, 'Meeting not found.')}</p>
        <Link to="/meetings" className="text-sm font-medium text-slate-600 hover:underline">
          Back to meetings
        </Link>
      </div>
    );
  }

  const active = detail.status === 'scheduled' || detail.status === 'rescheduled';
  const ownerDisplay = detail.ownerName ?? detail.ownerUserId;

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link to="/meetings" className="text-xs font-medium text-slate-500 hover:underline">
            ← All meetings
          </Link>
          <h1 className="mt-1 text-xl font-semibold tracking-tight">{detail.title}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {detail.clientName ?? '—'}
            {detail.projectName ? ` · ${detail.projectName}` : ''} ·{' '}
            {formatMeetingRange(detail.startsAt, detail.endsAt)} · {detail.timezone}
          </p>
        </div>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
          {MEETING_STATUS_LABELS[detail.status]}
        </span>
      </div>

      {detail.needsNotes ? (
        <p
          role="status"
          className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900"
        >
          Meeting Notes Pending — this meeting is completed but has no discussion notes yet.
        </p>
      ) : null}

      {actionError ? <p className="text-sm text-red-600">{actionError}</p> : null}

      {canManage && active ? (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setDialog('edit')}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            Edit
          </button>
          <button
            type="button"
            onClick={() => setDialog('reschedule')}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            Reschedule
          </button>
          <button
            type="button"
            onClick={() => setDialog('complete')}
            className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-700"
          >
            Mark Completed
          </button>
          <button
            type="button"
            onClick={() => setDialog('cancel')}
            className="rounded-md border border-red-300 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50"
          >
            Cancel
          </button>
        </div>
      ) : null}

      <section className="space-y-2 rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold">Meeting overview</h2>
        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs text-slate-500">Client</dt>
            <dd className="font-medium">{detail.clientName ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Project</dt>
            <dd className="font-medium">{detail.projectName ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Date</dt>
            <dd className="font-medium">{formatMeetingDate(detail.startsAt)}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Time</dt>
            <dd className="font-medium">
              {formatMeetingTime(detail.startsAt)} – {formatMeetingTime(detail.endsAt)} (
              {detail.timezone})
            </dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Owner</dt>
            <dd className="font-medium">{ownerDisplay}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Attendees</dt>
            <dd className="font-medium">
              {detail.attendeeUserIds.length === 0
                ? '—'
                : detail.attendeeUserIds
                    .map((attendeeId) =>
                      participantName(
                        attendeeId,
                        detail.attendeeNames,
                        detail.ownerName,
                        detail.ownerUserId,
                      ),
                    )
                    .join(', ')}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Meeting URL</dt>
            <dd className="font-medium">
              {detail.meetingUrl ? (
                <a
                  href={detail.meetingUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-slate-700 underline"
                >
                  {detail.meetingUrl}
                </a>
              ) : (
                '—'
              )}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Location</dt>
            <dd className="font-medium">{detail.location ?? '—'}</dd>
          </div>
        </dl>
        {detail.status === 'cancelled' && detail.cancellationReason ? (
          <p className="text-sm text-slate-600">
            <span className="font-medium">Cancellation reason:</span> {detail.cancellationReason}
          </p>
        ) : null}
      </section>

      <section className="space-y-2 rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold">Agenda</h2>
        <p className="whitespace-pre-wrap text-sm text-slate-700">{detail.agenda ?? '—'}</p>
      </section>

      <section className="space-y-2 rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-sm font-semibold">Discussion notes</h2>
          {canManage ? (
            <button
              type="button"
              onClick={() => setDialog('notes')}
              className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              {detail.discussionNotes ? 'Edit notes' : 'Add notes'}
            </button>
          ) : null}
        </div>
        <p className="whitespace-pre-wrap text-sm text-slate-700">
          {detail.discussionNotes ?? 'No notes recorded yet.'}
        </p>
      </section>

      <section className="space-y-2 rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-sm font-semibold">Decisions</h2>
          {canManage ? (
            <button
              type="button"
              onClick={() => setDialog('decisions')}
              className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              {detail.decisions.length > 0 ? 'Edit decisions' : 'Record decisions'}
            </button>
          ) : null}
        </div>
        {detail.decisions.length === 0 ? (
          <p className="text-sm text-slate-500">No decisions recorded yet.</p>
        ) : (
          <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-700">
            {detail.decisions.map((decision, index) => (
              <li key={`${index}-${decision}`}>{decision}</li>
            ))}
          </ol>
        )}
      </section>

      <section className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-sm font-semibold">Action items</h2>
          {canManage && detail.status !== 'cancelled' ? (
            <button
              type="button"
              onClick={() => {
                setEditingItem(null);
                setDialog('action-item');
              }}
              className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              Add action item
            </button>
          ) : null}
        </div>
        {actionItems.isPending ? (
          <p className="text-sm text-slate-500">Loading action items…</p>
        ) : actionItems.isError ? (
          <p className="text-sm text-red-600">{errorMessage(actionItems.error)}</p>
        ) : (actionItems.data ?? []).length === 0 ? (
          <p className="text-sm text-slate-500">No action items yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {(actionItems.data ?? []).map((item) => (
              <ActionItemRow
                key={item.id}
                item={item}
                canManage={canManage}
                meetingEditable={detail.status !== 'cancelled'}
                jobRoleName={(roleId) =>
                  jobRoles.data?.find((role) => role.id === roleId)?.name ?? roleId
                }
                onEdit={() => {
                  setEditingItem(item);
                  setDialog('action-item');
                }}
                onConvert={() => setConvertingItem(item)}
                meetingId={meetingId}
                setActionError={setActionError}
              />
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-2 rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold">Activity history</h2>
        {history.isPending ? (
          <p className="text-sm text-slate-500">Loading history…</p>
        ) : history.isError ? (
          <p className="text-sm text-red-600">{errorMessage(history.error)}</p>
        ) : (history.data ?? []).length === 0 ? (
          <p className="text-sm text-slate-500">No schedule changes recorded.</p>
        ) : (
          <ul className="space-y-2 text-sm text-slate-700">
            {(history.data ?? []).map((entry) => (
              <li key={entry.id} className="rounded-md bg-slate-50 px-3 py-2">
                <p className="font-medium">
                  {entry.action === 'meeting.create' ? 'Scheduled' : 'Rescheduled'}
                </p>
                <p className="text-xs text-slate-500">
                  {formatMeetingDate(entry.createdAt)} · {formatMeetingTime(entry.createdAt)}
                  {entry.notes ? ` · ${entry.notes}` : ''}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      {dialog === 'edit' ? (
        <EditMeetingDialog
          meetingId={meetingId}
          title={detail.title}
          agenda={detail.agenda}
          meetingUrl={detail.meetingUrl}
          location={detail.location}
          ownerUserId={detail.ownerUserId}
          attendeeUserIds={detail.attendeeUserIds}
          teamUserIds={(team.data ?? []).filter((member) => member.isActive).map((m) => m.userId)}
          employeeLabel={employeeLabel}
          version={detail.version}
          onClose={() => setDialog(null)}
          setActionError={setActionError}
        />
      ) : null}

      {dialog === 'reschedule' ? (
        <RescheduleDialog
          meetingId={meetingId}
          startsAt={detail.startsAt}
          endsAt={detail.endsAt}
          version={detail.version}
          onClose={() => setDialog(null)}
          setActionError={setActionError}
        />
      ) : null}

      {dialog === 'cancel' ? (
        <CancelDialog
          meetingId={meetingId}
          version={detail.version}
          onClose={() => setDialog(null)}
          setActionError={setActionError}
        />
      ) : null}

      {dialog === 'complete' ? (
        <CompleteDialog
          meetingId={meetingId}
          version={detail.version}
          onClose={() => setDialog(null)}
          setActionError={setActionError}
        />
      ) : null}

      {dialog === 'notes' ? (
        <NotesDialog
          meetingId={meetingId}
          initial={detail.discussionNotes ?? ''}
          version={detail.version}
          onClose={() => setDialog(null)}
          setActionError={setActionError}
        />
      ) : null}

      {dialog === 'decisions' ? (
        <DecisionsDialog
          meetingId={meetingId}
          initial={detail.decisions}
          version={detail.version}
          onClose={() => setDialog(null)}
          setActionError={setActionError}
        />
      ) : null}

      {dialog === 'action-item' ? (
        <ActionItemDialog
          meetingId={meetingId}
          clientId={detail.clientId}
          meetingProjectId={detail.projectId}
          initial={editingItem}
          version={editingItem?.version}
          onClose={() => {
            setDialog(null);
            setEditingItem(null);
          }}
          setActionError={setActionError}
        />
      ) : null}

      {convertingItem ? (
        <ConvertDialog
          meetingId={meetingId}
          item={convertingItem}
          meetingProjectId={detail.projectId}
          clientId={detail.clientId}
          onClose={() => setConvertingItem(null)}
          setActionError={setActionError}
        />
      ) : null}
    </div>
  );
}

function ActionItemRow({
  item,
  canManage,
  meetingEditable,
  jobRoleName,
  onEdit,
  onConvert,
  meetingId,
  setActionError,
}: {
  item: MeetingActionItemWithTask;
  canManage: boolean;
  meetingEditable: boolean;
  jobRoleName: (roleId: string) => string;
  onEdit: () => void;
  onConvert: () => void;
  meetingId: string;
  setActionError: (message: string | null) => void;
}) {
  const removeItem = useDeleteMeetingActionItem(meetingId);

  const handleDelete = (): void => {
    if (!window.confirm(`Delete action item "${item.title}"?`)) {
      return;
    }

    removeItem.mutate(item.id, {
      onError: (error) => setActionError(errorMessage(error)),
    });
  };

  return (
    <li className="py-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-slate-900">{item.title}</p>
          {item.description ? (
            <p className="mt-0.5 text-xs text-slate-600">{item.description}</p>
          ) : null}
          <p className="mt-1 text-xs text-slate-500">
            {jobRoleName(item.responsibleJobRoleId)} ·{' '}
            {item.assignedUserName ?? (item.needsAssignment ? 'Needs Assignment' : '—')}
            {item.dueAt ? ` · due ${formatMeetingDate(item.dueAt)}` : ''} · {item.priority} ·{' '}
            {MEETING_ACTION_ITEM_STATUS_LABELS[item.status]}
            {item.status === 'converted' && item.taskStatus ? ` · task ${item.taskStatus}` : ''}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {item.status === 'converted' && item.linkedTaskId ? (
            <Link
              to={`/tasks/${item.linkedTaskId}`}
              className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              Open task →
            </Link>
          ) : null}
          {canManage && meetingEditable && item.status !== 'converted' ? (
            <>
              <button
                type="button"
                onClick={onEdit}
                className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                Edit
              </button>
              <button
                type="button"
                onClick={onConvert}
                disabled={removeItem.isPending}
                className="rounded-md bg-slate-900 px-2.5 py-1 text-xs font-medium text-white hover:bg-slate-700 disabled:opacity-60"
              >
                Create task
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={removeItem.isPending}
                className="rounded-md border border-red-300 px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-60"
              >
                Delete
              </button>
            </>
          ) : null}
        </div>
      </div>
    </li>
  );
}

function EditMeetingDialog({
  meetingId,
  title,
  agenda,
  meetingUrl,
  location,
  ownerUserId,
  attendeeUserIds,
  teamUserIds,
  employeeLabel,
  version,
  onClose,
  setActionError,
}: {
  meetingId: string;
  title: string;
  agenda: string | null;
  meetingUrl: string | null;
  location: string | null;
  ownerUserId: string;
  attendeeUserIds: string[];
  teamUserIds: string[];
  employeeLabel: (userId: string) => string;
  version: number;
  onClose: () => void;
  setActionError: (message: string | null) => void;
}) {
  const update = useUpdateMeeting(meetingId);
  const [nextTitle, setNextTitle] = useState(title);
  const [nextAgenda, setNextAgenda] = useState(agenda ?? '');
  const [nextUrl, setNextUrl] = useState(meetingUrl ?? '');
  const [nextLocation, setNextLocation] = useState(location ?? '');
  const [nextOwner, setNextOwner] = useState(ownerUserId);
  const [nextAttendees, setNextAttendees] = useState<string[]>(attendeeUserIds);

  const toggle = (userId: string): void => {
    setNextAttendees((previous) =>
      previous.includes(userId) ? previous.filter((id) => id !== userId) : [...previous, userId],
    );
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();

    update.mutate(
      {
        title: nextTitle.trim(),
        agenda: nextAgenda.trim() === '' ? null : nextAgenda.trim(),
        meetingUrl: nextUrl.trim() === '' ? null : nextUrl.trim(),
        location: nextLocation.trim() === '' ? null : nextLocation.trim(),
        ownerUserId: nextOwner,
        attendeeUserIds: nextAttendees,
        expectedVersion: version,
      },
      {
        onSuccess: onClose,
        onError: (error) => setActionError(errorMessage(error)),
      },
    );
  };

  return (
    <Modal title="Edit meeting" onClose={onClose}>
      <form onSubmit={handleSubmit} className="grid gap-3">
        <TextField
          label="Title"
          name="edit-title"
          required
          value={nextTitle}
          onChange={(event) => setNextTitle(event.target.value)}
          maxLength={200}
        />
        <div className="space-y-1">
          <label htmlFor="edit-agenda" className="block text-sm font-medium text-slate-700">
            Agenda
          </label>
          <textarea
            id="edit-agenda"
            value={nextAgenda}
            onChange={(event) => setNextAgenda(event.target.value)}
            maxLength={5000}
            rows={3}
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="edit-owner" className="block text-sm font-medium text-slate-700">
            Owner
          </label>
          <select
            id="edit-owner"
            value={nextOwner}
            onChange={(event) => setNextOwner(event.target.value)}
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
          >
            {teamUserIds.map((userId) => (
              <option key={userId} value={userId}>
                {employeeLabel(userId)}
              </option>
            ))}
          </select>
        </div>
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-slate-700">Attendees</legend>
          <div className="grid gap-2 rounded-md border border-slate-200 p-3 sm:grid-cols-2">
            {teamUserIds
              .filter((userId) => userId !== nextOwner)
              .map((userId) => (
                <label key={userId} className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={nextAttendees.includes(userId)}
                    onChange={() => toggle(userId)}
                    className="h-4 w-4"
                  />
                  {employeeLabel(userId)}
                </label>
              ))}
          </div>
        </fieldset>
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField
            label="Meeting URL"
            name="edit-url"
            value={nextUrl}
            onChange={(event) => setNextUrl(event.target.value)}
            maxLength={2000}
          />
          <TextField
            label="Location"
            name="edit-location"
            value={nextLocation}
            onChange={(event) => setNextLocation(event.target.value)}
            maxLength={300}
          />
        </div>
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={update.isPending || nextTitle.trim() === ''}
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-60"
          >
            {update.isPending ? 'Saving…' : 'Save'}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
        </div>
      </form>
    </Modal>
  );
}

function RescheduleDialog({
  meetingId,
  startsAt,
  endsAt,
  version,
  onClose,
  setActionError,
}: {
  meetingId: string;
  startsAt: string;
  endsAt: string;
  version: number;
  onClose: () => void;
  setActionError: (message: string | null) => void;
}) {
  const reschedule = useRescheduleMeeting(meetingId);
  const [date, setDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [reason, setReason] = useState('');

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();

    if (date === '' || startTime === '' || endTime === '') {
      setActionError('Choose a date, start time and end time.');
      return;
    }

    if (endTime <= startTime) {
      setActionError('End time must be later than the start time.');
      return;
    }

    reschedule.mutate(
      {
        date,
        startTime,
        endTime,
        timezone: DEFAULT_TIMEZONE,
        reason: reason.trim() === '' ? null : reason.trim(),
        expectedVersion: version,
      },
      {
        onSuccess: onClose,
        onError: (error) => setActionError(errorMessage(error)),
      },
    );
  };

  return (
    <Modal title="Reschedule meeting" onClose={onClose}>
      <p className="mb-3 text-sm text-slate-600">
        Current: <span className="font-medium">{formatMeetingRange(startsAt, endsAt)}</span> (
        {DEFAULT_TIMEZONE}). The meeting keeps its identity — notes, decisions and action items are
        preserved, and a fresh reminder is scheduled.
      </p>
      <form onSubmit={handleSubmit} className="grid gap-3">
        <div className="grid gap-3 sm:grid-cols-3">
          <TextField
            label="New date"
            name="reschedule-date"
            type="date"
            required
            value={date}
            onChange={(event) => setDate(event.target.value)}
          />
          <TextField
            label="Start time"
            name="reschedule-start"
            type="time"
            required
            value={startTime}
            onChange={(event) => setStartTime(event.target.value)}
          />
          <TextField
            label="End time"
            name="reschedule-end"
            type="time"
            required
            value={endTime}
            onChange={(event) => setEndTime(event.target.value)}
          />
        </div>
        <TextField
          label="Reason (optional)"
          name="reschedule-reason"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          maxLength={1000}
        />
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={reschedule.isPending}
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-60"
          >
            {reschedule.isPending ? 'Saving…' : 'Reschedule'}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
        </div>
      </form>
    </Modal>
  );
}

function CancelDialog({
  meetingId,
  version,
  onClose,
  setActionError,
}: {
  meetingId: string;
  version: number;
  onClose: () => void;
  setActionError: (message: string | null) => void;
}) {
  const cancel = useCancelMeeting(meetingId);
  const [reason, setReason] = useState('');

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();

    if (reason.trim() === '') {
      setActionError('A cancellation reason is required.');
      return;
    }

    cancel.mutate(
      { reason: reason.trim(), expectedVersion: version },
      {
        onSuccess: onClose,
        onError: (error) => setActionError(errorMessage(error)),
      },
    );
  };

  return (
    <Modal title="Cancel meeting" onClose={onClose}>
      <form onSubmit={handleSubmit} className="grid gap-3">
        <TextField
          label="Reason"
          name="cancel-reason"
          required
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          maxLength={1000}
          hint="Recorded in history. Outstanding reminders stop."
        />
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={cancel.isPending}
            className="rounded-md bg-red-700 px-4 py-2 text-sm font-medium text-white hover:bg-red-600 disabled:opacity-60"
          >
            {cancel.isPending ? 'Cancelling…' : 'Cancel meeting'}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Keep meeting
          </button>
        </div>
      </form>
    </Modal>
  );
}

function CompleteDialog({
  meetingId,
  version,
  onClose,
  setActionError,
}: {
  meetingId: string;
  version: number;
  onClose: () => void;
  setActionError: (message: string | null) => void;
}) {
  const complete = useCompleteMeeting(meetingId);

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();

    complete.mutate(
      { expectedVersion: version },
      {
        onSuccess: onClose,
        onError: (error) => setActionError(errorMessage(error)),
      },
    );
  };

  return (
    <Modal title="Mark meeting completed" onClose={onClose}>
      <form onSubmit={handleSubmit} className="grid gap-3">
        <p className="text-sm text-slate-600">
          Completion preserves everything and stops future reminders. It never marks associated
          project tasks done. Record notes and decisions afterwards.
        </p>
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={complete.isPending}
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-60"
          >
            {complete.isPending ? 'Saving…' : 'Mark completed'}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
        </div>
      </form>
    </Modal>
  );
}

function NotesDialog({
  meetingId,
  initial,
  version,
  onClose,
  setActionError,
}: {
  meetingId: string;
  initial: string;
  version: number;
  onClose: () => void;
  setActionError: (message: string | null) => void;
}) {
  const update = useUpdateMeeting(meetingId);
  const [notes, setNotes] = useState(initial);

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();

    update.mutate(
      {
        discussionNotes: notes.trim() === '' ? null : notes,
        expectedVersion: version,
      },
      {
        onSuccess: onClose,
        onError: (error) => setActionError(errorMessage(error)),
      },
    );
  };

  return (
    <Modal title="Discussion notes" onClose={onClose}>
      <form onSubmit={handleSubmit} className="grid gap-3">
        <div className="space-y-1">
          <label htmlFor="notes-text" className="block text-sm font-medium text-slate-700">
            Notes
          </label>
          <textarea
            id="notes-text"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            rows={6}
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
          />
        </div>
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={update.isPending}
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-60"
          >
            {update.isPending ? 'Saving…' : 'Save notes'}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
        </div>
      </form>
    </Modal>
  );
}

function DecisionsDialog({
  meetingId,
  initial,
  version,
  onClose,
  setActionError,
}: {
  meetingId: string;
  initial: string[];
  version: number;
  onClose: () => void;
  setActionError: (message: string | null) => void;
}) {
  const update = useUpdateMeeting(meetingId);
  const [text, setText] = useState(initial.join('\n'));

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();

    const decisions = text
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    update.mutate(
      { decisions, expectedVersion: version },
      {
        onSuccess: onClose,
        onError: (error) => setActionError(errorMessage(error)),
      },
    );
  };

  return (
    <Modal title="Record decisions" onClose={onClose}>
      <form onSubmit={handleSubmit} className="grid gap-3">
        <div className="space-y-1">
          <label htmlFor="decisions-text" className="block text-sm font-medium text-slate-700">
            Decisions (one per line)
          </label>
          <textarea
            id="decisions-text"
            value={text}
            onChange={(event) => setText(event.target.value)}
            rows={6}
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
          />
        </div>
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={update.isPending}
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-60"
          >
            {update.isPending ? 'Saving…' : 'Save decisions'}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
        </div>
      </form>
    </Modal>
  );
}

function ActionItemDialog({
  meetingId,
  clientId,
  meetingProjectId,
  initial,
  version,
  onClose,
  setActionError,
}: {
  meetingId: string;
  clientId: string;
  meetingProjectId: string | null;
  initial: MeetingActionItemWithTask | null;
  version: number | undefined;
  onClose: () => void;
  setActionError: (message: string | null) => void;
}) {
  const createItem = useCreateMeetingActionItem(meetingId);
  const updateItem = useUpdateMeetingActionItem(meetingId);
  const jobRoles = useJobRoles();
  const projects = useClientProjects(clientId);

  const [title, setTitle] = useState(initial?.title ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [roleId, setRoleId] = useState(initial?.responsibleJobRoleId ?? '');
  const [assigneeId, setAssigneeId] = useState(initial?.assignedUserId ?? '');
  const [projectId, setProjectId] = useState(initial?.projectId ?? meetingProjectId ?? '');
  const [dueDate, setDueDate] = useState('');
  const [priority, setPriority] = useState<string>(initial?.priority ?? 'medium');

  const pending = createItem.isPending || updateItem.isPending;

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();

    if (title.trim() === '') {
      setActionError('Enter an action item title.');
      return;
    }

    if (roleId === '') {
      setActionError('Select the responsible job role.');
      return;
    }

    const payload = {
      title: title.trim(),
      description: description.trim() === '' ? null : description.trim(),
      responsibleJobRoleId: roleId,
      assignedUserId: assigneeId.trim() === '' ? null : assigneeId.trim(),
      projectId: projectId === '' ? null : projectId,
      dueAt: dueDate.trim() === '' ? null : new Date(dueDate).toISOString(),
      priority: priority as 'low' | 'medium' | 'high' | 'urgent',
    };

    if (initial) {
      updateItem.mutate(
        { actionItemId: initial.id, input: { ...payload, expectedVersion: version } },
        {
          onSuccess: onClose,
          onError: (error) => setActionError(errorMessage(error)),
        },
      );
    } else {
      createItem.mutate(payload, {
        onSuccess: onClose,
        onError: (error) => setActionError(errorMessage(error)),
      });
    }
  };

  return (
    <Modal title={initial ? 'Edit action item' : 'Add action item'} onClose={onClose}>
      <form onSubmit={handleSubmit} className="grid gap-3">
        <TextField
          label="Title"
          name="action-title"
          required
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          maxLength={200}
        />
        <TextField
          label="Description"
          name="action-description"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          maxLength={2000}
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <label htmlFor="action-role" className="block text-sm font-medium text-slate-700">
              Job role *
            </label>
            <select
              id="action-role"
              value={roleId}
              onChange={(event) => setRoleId(event.target.value)}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
              required
            >
              <option value="">Select role…</option>
              {jobRoles.data?.map((role) => (
                <option key={role.id} value={role.id}>
                  {role.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label htmlFor="action-project" className="block text-sm font-medium text-slate-700">
              Project
            </label>
            <select
              id="action-project"
              value={projectId}
              onChange={(event) => setProjectId(event.target.value)}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
            >
              <option value="">Meeting project</option>
              {projects.data?.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField
            label="Assignee user id"
            name="action-assignee"
            value={assigneeId}
            onChange={(event) => setAssigneeId(event.target.value)}
            placeholder="Empty when unassigned"
            hint="Must hold the job role and belong to the client team."
          />
          <TextField
            label="Due date"
            name="action-due"
            type="date"
            value={dueDate}
            onChange={(event) => setDueDate(event.target.value)}
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="action-priority" className="block text-sm font-medium text-slate-700">
            Priority
          </label>
          <select
            id="action-priority"
            value={priority}
            onChange={(event) => setPriority(event.target.value)}
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
          >
            {TASK_PRIORITIES.map((value) => (
              <option key={value} value={value}>
                {TASK_PRIORITY_LABELS[value]}
              </option>
            ))}
          </select>
        </div>
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-60"
          >
            {pending ? 'Saving…' : initial ? 'Save changes' : 'Add action item'}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
        </div>
      </form>
    </Modal>
  );
}

function ConvertDialog({
  meetingId,
  item,
  meetingProjectId,
  clientId,
  onClose,
  setActionError,
}: {
  meetingId: string;
  item: MeetingActionItemWithTask;
  meetingProjectId: string | null;
  clientId: string;
  onClose: () => void;
  setActionError: (message: string | null) => void;
}) {
  const navigate = useNavigate();
  const convert = useConvertMeetingActionItem(meetingId);
  const projects = useClientProjects(clientId);

  const [projectId, setProjectId] = useState(item.projectId ?? meetingProjectId ?? '');
  const [approvalRequired, setApprovalRequired] = useState(false);
  const [approverId, setApproverId] = useState('');

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();

    convert.mutate(
      {
        actionItemId: item.id,
        input: {
          projectId: projectId === '' ? undefined : projectId,
          approvalRequired,
          approverId: approverId.trim() === '' ? null : approverId.trim(),
          expectedVersion: item.version,
        },
      },
      {
        onSuccess: (result) => {
          onClose();
          navigate(`/tasks/${result.taskId}`);
        },
        onError: (error) => setActionError(errorMessage(error)),
      },
    );
  };

  return (
    <Modal title="Convert to task" onClose={onClose}>
      <form onSubmit={handleSubmit} className="grid gap-3">
        <p className="text-sm text-slate-600">
          Creates a real task from “{item.title}” and links it back. Repeating this is idempotent —
          the same task is returned instead of a duplicate.
        </p>
        {meetingProjectId || item.projectId ? null : (
          <div className="space-y-1">
            <label htmlFor="convert-project" className="block text-sm font-medium text-slate-700">
              Project *
            </label>
            <select
              id="convert-project"
              value={projectId}
              onChange={(event) => setProjectId(event.target.value)}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
              required
            >
              <option value="">Select project…</option>
              {projects.data?.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </div>
        )}
        <label className="flex items-center gap-2 text-sm text-slate-700">
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
            label="Approver user id"
            name="convert-approver"
            value={approverId}
            onChange={(event) => setApproverId(event.target.value)}
            placeholder="Optional"
          />
        ) : null}
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={convert.isPending}
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-60"
          >
            {convert.isPending ? 'Converting…' : 'Create task'}
          </button>
          <button
            type="button"
            onClick={onClose}
            disabled={convert.isPending}
            className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
        </div>
      </form>
    </Modal>
  );
}
