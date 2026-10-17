import {
  MEETING_STATUS_LABELS,
  MEETING_STATUSES,
  hasCapability,
  type MeetingStatus,
  type MeetingSummary,
  type UserProfile,
} from '@interscale/shared';
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type SortingState,
} from '@tanstack/react-table';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { TextField } from '../components/ui/TextField';
import { useClients } from '../hooks/useClients';
import { useEmployees } from '../hooks/useEmployees';
import { useMeetings, useMyMeetings } from '../hooks/useMeetings';
import { useProjects } from '../hooks/useProjects';
import { useSession } from '../hooks/useSession';
import { errorMessage } from '../lib/api';
import { formatMeetingDate, formatMeetingTime, todayIst } from '../lib/meeting-dates';

const columnHelper = createColumnHelper<MeetingSummary>();

type MeetingView = 'all' | 'today' | 'upcoming' | 'completed' | 'cancelled';

const VIEW_LABELS: Record<MeetingView, string> = {
  all: 'All',
  today: 'Today',
  upcoming: 'Upcoming',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

function canScheduleMeetings(user: UserProfile | null): boolean {
  if (!user) {
    return false;
  }

  return hasCapability(user.accessLevel, user.capabilities, 'meetings.manage');
}

/** Scoped meeting list with views, filters, sorting and pagination (Step 35.3). */
export function MeetingsPage({ scope = 'all' }: { scope?: 'all' | 'mine' }) {
  const { user } = useSession();
  const isAdmin = user?.accessLevel === 'Admin';
  const canSchedule = canScheduleMeetings(user);

  const [view, setView] = useState<MeetingView>('all');
  const [clientId, setClientId] = useState('');
  const [projectId, setProjectId] = useState('');
  const [ownerUserId, setOwnerUserId] = useState('');
  const [status, setStatus] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [search, setSearch] = useState('');
  const [sorting, setSorting] = useState<SortingState>([{ id: 'startsAt', desc: false }]);

  const filters = useMemo(() => {
    const next: {
      clientId?: string;
      projectId?: string;
      ownerUserId?: string;
      status?: MeetingStatus;
      from?: string;
      to?: string;
      date?: string;
      search?: string;
    } = {};

    if (clientId !== '') {
      next.clientId = clientId;
    }

    if (projectId !== '') {
      next.projectId = projectId;
    }

    if (ownerUserId.trim() !== '') {
      next.ownerUserId = ownerUserId.trim();
    }

    if (view === 'today') {
      next.date = todayIst();
    } else if (view === 'upcoming') {
      next.from = new Date().toISOString();
    } else if (view === 'completed' || view === 'cancelled') {
      next.status = view;
    }

    if (status !== '') {
      next.status = status as MeetingStatus;
    }

    if (fromDate !== '') {
      next.from = new Date(`${fromDate}T00:00:00+05:30`).toISOString();
    }

    if (toDate !== '') {
      const end = new Date(`${toDate}T00:00:00+05:30`);
      end.setUTCDate(end.getUTCDate() + 1);
      next.to = end.toISOString();
    }

    if (search.trim() !== '') {
      next.search = search.trim();
    }

    return next;
  }, [view, clientId, projectId, ownerUserId, status, fromDate, toDate, search]);

  const allMeetings = useMeetings(scope === 'all' ? filters : {}, scope === 'all');
  const myMeetings = useMyMeetings(scope === 'mine' ? filters : {}, scope === 'mine');
  const meetings = scope === 'all' ? allMeetings : myMeetings;

  const clients = useClients('');
  const projects = useProjects(clientId === '' ? {} : { clientId });
  const employees = useEmployees(isAdmin ?? false);

  const columns = useMemo(
    () => [
      columnHelper.accessor('title', {
        header: 'Meeting',
        cell: (info) => (
          <div>
            <Link
              to={`/meetings/${info.row.original.id}`}
              className="font-medium text-slate-900 hover:underline"
            >
              {info.getValue()}
            </Link>
            {info.row.original.needsNotes ? (
              <p className="text-xs font-medium text-amber-700">Meeting Notes Pending</p>
            ) : null}
          </div>
        ),
      }),
      columnHelper.accessor('clientName', {
        header: 'Client',
        cell: (info) => info.getValue() ?? '—',
      }),
      columnHelper.accessor('projectName', {
        header: 'Project',
        cell: (info) => info.getValue() ?? '—',
      }),
      columnHelper.accessor('ownerName', {
        header: 'Project Manager',
        cell: (info) => info.getValue() ?? '—',
      }),
      columnHelper.accessor('startsAt', {
        header: 'Date',
        cell: (info) => formatMeetingDate(info.getValue()),
      }),
      columnHelper.accessor('startsAt', {
        id: 'startTime',
        header: 'Starts',
        cell: (info) => formatMeetingTime(info.row.original.startsAt),
      }),
      columnHelper.accessor('endsAt', {
        header: 'Ends',
        cell: (info) => formatMeetingTime(info.getValue()),
      }),
      columnHelper.accessor('status', {
        header: 'Status',
        cell: (info) => MEETING_STATUS_LABELS[info.getValue()],
      }),
      columnHelper.display({
        id: 'action',
        header: 'Action',
        cell: (info) => (
          <Link
            to={`/meetings/${info.row.original.id}`}
            className="text-sm font-medium text-slate-600 hover:underline"
          >
            Open →
          </Link>
        ),
      }),
    ],
    [],
  );

  const data = useMemo(() => meetings.data ?? [], [meetings.data]);

  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 20 } },
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            {scope === 'mine' ? 'My Meetings' : 'Meetings'}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {scope === 'mine'
              ? 'Client meetings you own or attend.'
              : 'Scheduled client meetings across your scope.'}
          </p>
        </div>
        {canSchedule ? (
          <Link
            to="/meetings/new"
            className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-slate-700"
          >
            New Meeting
          </Link>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2" role="group" aria-label="Meeting views">
        {(Object.keys(VIEW_LABELS) as MeetingView[]).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setView(key)}
            className={[
              'rounded-full px-3 py-1.5 text-xs font-medium transition',
              view === key
                ? 'bg-slate-900 text-white'
                : 'border border-slate-300 bg-white text-slate-600 hover:bg-slate-50',
            ].join(' ')}
          >
            {VIEW_LABELS[key]}
          </button>
        ))}
      </div>

      <div className="grid max-w-4xl gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <TextField
          label="Search"
          name="meeting-search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Filter by title"
        />
        <div className="space-y-1">
          <label htmlFor="meeting-client" className="block text-sm font-medium text-slate-700">
            Client
          </label>
          <select
            id="meeting-client"
            value={clientId}
            onChange={(event) => {
              setClientId(event.target.value);
              setProjectId('');
            }}
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
          >
            <option value="">All clients</option>
            {clients.data?.map((client) => (
              <option key={client.id} value={client.id}>
                {client.name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label htmlFor="meeting-project" className="block text-sm font-medium text-slate-700">
            Project
          </label>
          <select
            id="meeting-project"
            value={projectId}
            onChange={(event) => setProjectId(event.target.value)}
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
          >
            <option value="">All projects</option>
            {projects.data?.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label htmlFor="meeting-status" className="block text-sm font-medium text-slate-700">
            Status
          </label>
          <select
            id="meeting-status"
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
          >
            <option value="">All statuses</option>
            {MEETING_STATUSES.map((value) => (
              <option key={value} value={value}>
                {MEETING_STATUS_LABELS[value]}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label htmlFor="meeting-owner" className="block text-sm font-medium text-slate-700">
            Owner
          </label>
          {isAdmin && employees.data ? (
            <select
              id="meeting-owner"
              value={ownerUserId}
              onChange={(event) => setOwnerUserId(event.target.value)}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
            >
              <option value="">All owners</option>
              {employees.data.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.name}
                </option>
              ))}
            </select>
          ) : (
            <input
              id="meeting-owner"
              value={ownerUserId}
              onChange={(event) => setOwnerUserId(event.target.value)}
              placeholder="Owner user id"
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
            />
          )}
        </div>
        <TextField
          label="From date"
          name="meeting-from"
          type="date"
          value={fromDate}
          onChange={(event) => setFromDate(event.target.value)}
        />
        <TextField
          label="To date"
          name="meeting-to"
          type="date"
          value={toDate}
          onChange={(event) => setToDate(event.target.value)}
        />
      </div>

      {meetings.isPending ? (
        <p className="text-sm text-slate-500">Loading meetings…</p>
      ) : meetings.isError ? (
        <p className="text-sm text-red-600">{errorMessage(meetings.error)}</p>
      ) : data.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-300 bg-white px-4 py-6 text-center text-sm text-slate-500">
          No meetings match these filters.
        </p>
      ) : (
        <div className="space-y-3">
          <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
            <table className="w-full min-w-[64rem] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                {table.getHeaderGroups().map((group) => (
                  <tr key={group.id}>
                    {group.headers.map((header) => (
                      <th key={header.id} className="px-4 py-3">
                        {header.isPlaceholder ? null : (
                          <button
                            type="button"
                            onClick={header.column.getToggleSortingHandler()}
                            className="inline-flex items-center gap-1 uppercase tracking-wide hover:text-slate-800"
                          >
                            {flexRender(header.column.columnDef.header, header.getContext())}
                            {{
                              asc: ' ↑',
                              desc: ' ↓',
                            }[header.column.getIsSorted() as string] ?? null}
                          </button>
                        )}
                      </th>
                    ))}
                  </tr>
                ))}
              </thead>
              <tbody className="divide-y divide-slate-100">
                {table.getRowModel().rows.map((row) => (
                  <tr key={row.id} className="hover:bg-slate-50">
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id} className="px-4 py-3">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center gap-3 text-sm text-slate-600">
            <button
              type="button"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
              className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium disabled:opacity-50"
            >
              Previous
            </button>
            <span className="text-xs">
              Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount()}
            </span>
            <button
              type="button"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
              className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
