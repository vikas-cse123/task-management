import { Link } from 'react-router-dom';
import { useMeetingSummary, useMeetings, useMyMeetings } from '../../hooks/useMeetings';
import { useMyTasks } from '../../hooks/useTasks';
import { errorMessage } from '../../lib/api';
import { formatMeetingTime, todayIst } from '../../lib/meeting-dates';

/**
 * Dashboard meetings integration (Steps 35.10 + 35.11).
 *
 * Counts come from the scoped `GET /meetings/summary` endpoint and the daily
 * schedule combines the user's own meetings today with their tasks due today.
 * Tasks never invent meeting-like start times — they group under "Due today".
 */
export function MeetingsOverview({ isAdmin }: { isAdmin: boolean }) {
  const today = todayIst();
  const summary = useMeetingSummary();
  const myToday = useMyMeetings({ date: today });
  const allToday = useMeetings({ date: today }, isAdmin);
  const tasksDue = useMyTasks({ due: 'today' });

  const meetings = (isAdmin ? allToday.data : myToday.data) ?? [];
  const meetingsQuery = isAdmin ? allToday : myToday;
  const sorted = [...meetings].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const tasks = [...(tasksDue.data ?? [])].sort((a, b) =>
    (a.dueAt ?? '').localeCompare(b.dueAt ?? ''),
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Meetings</h2>
        <Link to="/meetings" className="text-xs font-medium text-slate-600 underline">
          View all
        </Link>
      </div>

      {summary.isPending ? (
        <p className="text-sm text-slate-500">Loading meeting summary…</p>
      ) : summary.isError ? (
        <p className="text-sm text-red-600">{errorMessage(summary.error)}</p>
      ) : summary.data ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Meetings today" value={summary.data.today} link="/meetings" />
          <StatCard label="Upcoming meetings" value={summary.data.upcoming} link="/meetings" />
          <StatCard
            label="Meetings pending notes"
            value={summary.data.pendingNotes}
            accent={summary.data.pendingNotes > 0}
            link="/meetings"
          />
          <StatCard
            label="Open action items"
            value={summary.data.openActionItems}
            link="/meetings"
          />
          <StatCard label="Completed meetings" value={summary.data.completed} link="/meetings" />
          <StatCard label="Cancelled meetings" value={summary.data.cancelled} link="/meetings" />
          <StatCard
            label="Converted to tasks"
            value={summary.data.convertedActionItems}
            link="/my-tasks"
          />
        </div>
      ) : null}

      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <h3 className="text-sm font-semibold">Today — schedule</h3>
        {meetingsQuery.isPending || tasksDue.isPending ? (
          <p className="mt-2 text-sm text-slate-500">Loading today&apos;s schedule…</p>
        ) : meetingsQuery.isError ? (
          <p className="mt-2 text-sm text-red-600">{errorMessage(meetingsQuery.error)}</p>
        ) : sorted.length === 0 && tasks.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">Nothing scheduled for today.</p>
        ) : (
          <ul className="mt-2 divide-y divide-slate-100">
            {sorted.map((meeting) => (
              <li key={meeting.id} className="flex items-baseline gap-4 py-2">
                <span className="w-20 shrink-0 text-xs font-medium text-slate-500">
                  {formatMeetingTime(meeting.startsAt)}
                </span>
                <span className="min-w-0 flex-1 text-sm">
                  <Link
                    to={`/meetings/${meeting.id}`}
                    className="font-medium text-slate-900 hover:underline"
                  >
                    {meeting.title}
                  </Link>
                  <span className="block truncate text-xs text-slate-500">
                    {meeting.clientName ?? '—'}
                    {meeting.projectName ? ` · ${meeting.projectName}` : ''}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
        {tasks.length > 0 ? (
          <div className="mt-3 border-t border-slate-100 pt-3">
            <h4 className="text-xs font-semibold text-slate-500">Due Today / Tasks</h4>
            <ul className="mt-1 divide-y divide-slate-100">
              {tasks.map((task) => (
                <li key={task.id} className="py-1.5 text-sm">
                  <Link
                    to={`/tasks/${task.id}`}
                    className="font-medium text-slate-900 hover:underline"
                  >
                    {task.title}
                  </Link>
                  <span className="ml-2 text-xs text-slate-500">
                    {task.projectName ?? ''} · due{' '}
                    {task.dueAt ? formatMeetingTime(task.dueAt) : '—'}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  accent,
  link,
}: {
  label: string;
  value: number;
  accent?: boolean;
  link: string;
}) {
  return (
    <Link to={link} className="rounded-lg border border-slate-200 bg-white p-4 hover:bg-slate-50">
      <p className="text-xs font-medium tracking-wide text-slate-500 uppercase">{label}</p>
      <p className={`mt-1 text-3xl font-semibold ${accent ? 'text-amber-700' : ''}`}>{value}</p>
    </Link>
  );
}
