import { MEETING_STATUS_LABELS, type MeetingSummary } from '@interscale/shared';
import { Link } from 'react-router-dom';
import { errorMessage } from '../../lib/api';
import { formatMeetingDate, formatMeetingTime } from '../../lib/meeting-dates';

/**
 * Upcoming/previous meeting links for client and project detail pages
 * (Steps 35.12 + 35.13). Data comes from the scoped list endpoints, so
 * visibility permissions are enforced server-side — links never bypass access
 * because detail routes re-check scope.
 */
export function MeetingLinkList({
  meetings,
  isPending,
  isError,
  error,
  emptyText,
}: {
  meetings: MeetingSummary[] | undefined;
  isPending: boolean;
  isError: boolean;
  error: unknown;
  emptyText: string;
}) {
  const sorted = [...(meetings ?? [])].sort((a, b) => b.startsAt.localeCompare(a.startsAt));
  const upcoming = sorted.filter(
    (meeting) => meeting.status === 'scheduled' || meeting.status === 'rescheduled',
  );
  const previous = sorted.filter(
    (meeting) => meeting.status !== 'scheduled' && meeting.status !== 'rescheduled',
  );

  if (isPending) {
    return <p className="text-sm text-slate-500">Loading meetings…</p>;
  }

  if (isError) {
    return <p className="text-sm text-red-600">{errorMessage(error)}</p>;
  }

  if (sorted.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-slate-300 bg-white px-4 py-6 text-center text-sm text-slate-500">
        {emptyText}
      </p>
    );
  }

  const renderRow = (meeting: MeetingSummary) => (
    <li key={meeting.id}>
      <Link
        to={`/meetings/${meeting.id}`}
        className="flex items-center justify-between gap-4 px-4 py-3 transition hover:bg-slate-50"
      >
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-slate-900">{meeting.title}</p>
          <p className="text-xs text-slate-500">
            {formatMeetingDate(meeting.startsAt)} · {formatMeetingTime(meeting.startsAt)} ·{' '}
            {meeting.ownerName ?? '—'} · {MEETING_STATUS_LABELS[meeting.status]}
            {meeting.needsNotes ? ' · Meeting Notes Pending' : ''}
          </p>
        </div>
        <span className="shrink-0 text-xs font-medium text-slate-400">Open →</span>
      </Link>
    </li>
  );

  return (
    <div className="space-y-4">
      <div>
        <h3 className="mb-1 text-xs font-semibold text-slate-500 uppercase">Upcoming</h3>
        {upcoming.length === 0 ? (
          <p className="text-sm text-slate-500">No upcoming meetings.</p>
        ) : (
          <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
            {upcoming.map(renderRow)}
          </ul>
        )}
      </div>
      <div>
        <h3 className="mb-1 text-xs font-semibold text-slate-500 uppercase">Previous</h3>
        {previous.length === 0 ? (
          <p className="text-sm text-slate-500">No previous meetings.</p>
        ) : (
          <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
            {previous.map(renderRow)}
          </ul>
        )}
      </div>
    </div>
  );
}
