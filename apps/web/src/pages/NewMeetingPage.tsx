import { DEFAULT_TIMEZONE, hasCapability, type UserProfile } from '@interscale/shared';
import { useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { TextField } from '../components/ui/TextField';
import { useClientTeam, useClients } from '../hooks/useClients';
import { useEmployees } from '../hooks/useEmployees';
import { useCreateMeeting, useMeetingOverlap } from '../hooks/useMeetings';
import { useClientProjects } from '../hooks/useProjects';
import { useSession } from '../hooks/useSession';
import { errorMessage } from '../lib/api';
import { formatMeetingDate, formatMeetingTime } from '../lib/meeting-dates';

function canScheduleMeetings(user: UserProfile | null): boolean {
  if (!user) {
    return false;
  }

  return hasCapability(user.accessLevel, user.capabilities, 'meetings.manage');
}

/** Meeting creation form with eligibility-aware pickers and overlap warnings (Step 35.5). */
export function NewMeetingPage() {
  const navigate = useNavigate();
  const { user } = useSession();
  const isAdmin = user?.accessLevel === 'Admin';
  const allowed = canScheduleMeetings(user);

  const [clientId, setClientId] = useState('');
  const [projectId, setProjectId] = useState('');
  const [title, setTitle] = useState('');
  const [agenda, setAgenda] = useState('');
  const [date, setDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [ownerUserId, setOwnerUserId] = useState('');
  const [attendeeUserIds, setAttendeeUserIds] = useState<string[]>([]);
  const [meetingUrl, setMeetingUrl] = useState('');
  const [location, setLocation] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const clients = useClients('');
  const projects = useClientProjects(clientId === '' ? undefined : clientId);
  const team = useClientTeam(clientId === '' ? undefined : clientId);
  const employees = useEmployees(isAdmin ?? false);
  const createMeeting = useCreateMeeting();

  const activeMembers = useMemo(
    () => (team.data ?? []).filter((member) => member.isActive),
    [team.data],
  );

  const memberLabel = (userId: string): string => {
    const employee = employees.data?.find((item) => item.id === userId);

    if (employee) {
      return `${employee.name} (${employee.email})`;
    }

    if (user && user.id === userId) {
      return `${user.name} (you)`;
    }

    return userId;
  };

  const scheduleReady =
    ownerUserId.trim() !== '' && date !== '' && startTime !== '' && endTime !== '';

  const overlap = useMeetingOverlap(
    scheduleReady
      ? {
          ownerUserId: ownerUserId.trim(),
          date,
          startTime,
          endTime,
          timezone: DEFAULT_TIMEZONE,
        }
      : null,
  );

  const toggleAttendee = (userId: string): void => {
    setAttendeeUserIds((previous) =>
      previous.includes(userId) ? previous.filter((id) => id !== userId) : [...previous, userId],
    );
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    setFormError(null);

    if (clientId === '') {
      setFormError('Select a client.');
      return;
    }

    if (title.trim() === '') {
      setFormError('Enter a meeting title.');
      return;
    }

    if (date === '' || startTime === '' || endTime === '') {
      setFormError('Choose a date, start time and end time.');
      return;
    }

    if (endTime <= startTime) {
      setFormError('End time must be later than the start time.');
      return;
    }

    if (ownerUserId.trim() === '') {
      setFormError('Select the responsible Project Manager.');
      return;
    }

    createMeeting.mutate(
      {
        clientId,
        projectId: projectId === '' ? null : projectId,
        title: title.trim(),
        agenda: agenda.trim() === '' ? null : agenda.trim(),
        ownerUserId: ownerUserId.trim(),
        attendeeUserIds,
        meetingUrl: meetingUrl.trim() === '' ? null : meetingUrl.trim(),
        location: location.trim() === '' ? null : location.trim(),
        date,
        startTime,
        endTime,
        timezone: DEFAULT_TIMEZONE,
      },
      {
        onSuccess: (meeting) => navigate(`/meetings/${meeting.id}`),
        onError: (error) => setFormError(errorMessage(error)),
      },
    );
  };

  if (!allowed) {
    return (
      <div className="space-y-3">
        <h1 className="text-xl font-semibold tracking-tight">New Meeting</h1>
        <p className="text-sm text-red-600">
          Scheduling meetings requires the meetings.manage capability. Ask an Admin to grant it.
        </p>
        <Link to="/meetings" className="text-sm font-medium text-slate-600 hover:underline">
          Back to meetings
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">New Meeting</h1>
        <p className="mt-1 text-sm text-slate-500">
          Schedule a client meeting. Times are entered in {DEFAULT_TIMEZONE} and stored as UTC.
        </p>
      </div>

      <form onSubmit={handleSubmit} noValidate className="grid gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <label htmlFor="new-client" className="block text-sm font-medium text-slate-700">
              Client *
            </label>
            <select
              id="new-client"
              value={clientId}
              onChange={(event) => {
                setClientId(event.target.value);
                setProjectId('');
                setOwnerUserId('');
                setAttendeeUserIds([]);
              }}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
              required
            >
              <option value="">Select client…</option>
              {clients.data?.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label htmlFor="new-project" className="block text-sm font-medium text-slate-700">
              Project (optional)
            </label>
            <select
              id="new-project"
              value={projectId}
              onChange={(event) => setProjectId(event.target.value)}
              disabled={clientId === ''}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm disabled:bg-slate-100"
            >
              <option value="">No project</option>
              {projects.data?.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <TextField
          label="Meeting title"
          name="title"
          required
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          maxLength={200}
        />

        <div className="space-y-1">
          <label htmlFor="new-agenda" className="block text-sm font-medium text-slate-700">
            Agenda
          </label>
          <textarea
            id="new-agenda"
            value={agenda}
            onChange={(event) => setAgenda(event.target.value)}
            maxLength={5000}
            rows={4}
            placeholder="Discussion topics, one per line"
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <TextField
            label="Date"
            name="date"
            type="date"
            required
            value={date}
            onChange={(event) => setDate(event.target.value)}
          />
          <TextField
            label="Start time"
            name="startTime"
            type="time"
            required
            value={startTime}
            onChange={(event) => setStartTime(event.target.value)}
          />
          <TextField
            label="End time"
            name="endTime"
            type="time"
            required
            value={endTime}
            onChange={(event) => setEndTime(event.target.value)}
          />
        </div>

        <p className="text-xs text-slate-500">
          Timezone: <span className="font-medium">{DEFAULT_TIMEZONE}</span> (fixed for the
          India-based team).
        </p>

        <div className="space-y-1">
          <label htmlFor="new-owner" className="block text-sm font-medium text-slate-700">
            Responsible Project Manager *
          </label>
          {clientId === '' ? (
            <p className="text-xs text-slate-500">Select a client first to see eligible owners.</p>
          ) : team.isPending ? (
            <p className="text-xs text-slate-500">Loading client team…</p>
          ) : team.isError ? (
            <p className="text-xs text-red-600">{errorMessage(team.error)}</p>
          ) : activeMembers.length === 0 ? (
            <p className="text-xs text-red-600">
              No active client team members. The owner must be an active member of this client.
            </p>
          ) : (
            <select
              id="new-owner"
              value={ownerUserId}
              onChange={(event) => setOwnerUserId(event.target.value)}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
              required
            >
              <option value="">Select owner…</option>
              {activeMembers.map((member) => (
                <option key={member.userId} value={member.userId}>
                  {memberLabel(member.userId)} · {member.roleInTeam}
                </option>
              ))}
            </select>
          )}
          <p className="text-xs text-slate-500">
            The owner must be an active member of the selected client team.
          </p>
        </div>

        {scheduleReady && overlap.data && overlap.data.length > 0 ? (
          <div
            role="status"
            className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900"
          >
            <p className="font-medium">Overlap warning — this owner already has:</p>
            <ul className="mt-1 list-disc pl-5">
              {overlap.data.map((item) => (
                <li key={item.id}>
                  {item.title} · {formatMeetingDate(item.startsAt)}{' '}
                  {formatMeetingTime(item.startsAt)} – {formatMeetingTime(item.endsAt)}
                </li>
              ))}
            </ul>
            <p className="mt-1">You can still save; this never blocks scheduling.</p>
          </div>
        ) : null}

        {activeMembers.length > 0 ? (
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium text-slate-700">Internal attendees</legend>
            <div className="grid gap-2 rounded-md border border-slate-200 bg-white p-3 sm:grid-cols-2">
              {activeMembers
                .filter((member) => member.userId !== ownerUserId)
                .map((member) => (
                  <label
                    key={member.userId}
                    className="flex items-center gap-2 text-sm text-slate-700"
                  >
                    <input
                      type="checkbox"
                      checked={attendeeUserIds.includes(member.userId)}
                      onChange={() => toggleAttendee(member.userId)}
                      className="h-4 w-4"
                    />
                    {memberLabel(member.userId)}
                  </label>
                ))}
            </div>
          </fieldset>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Meeting URL"
            name="meetingUrl"
            value={meetingUrl}
            onChange={(event) => setMeetingUrl(event.target.value)}
            placeholder="https://…"
            maxLength={2000}
          />
          <TextField
            label="Location"
            name="location"
            value={location}
            onChange={(event) => setLocation(event.target.value)}
            placeholder="Office, client site…"
            maxLength={300}
          />
        </div>

        {formError ? <p className="text-sm text-red-600">{formError}</p> : null}

        <div className="flex gap-2">
          <button
            type="submit"
            disabled={createMeeting.isPending}
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700 disabled:opacity-60"
          >
            {createMeeting.isPending ? 'Scheduling…' : 'Schedule meeting'}
          </button>
          <Link
            to="/meetings"
            className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
