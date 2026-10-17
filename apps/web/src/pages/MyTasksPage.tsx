import {
  TASK_PRIORITIES,
  TASK_PRIORITY_LABELS,
  TASK_STATUS_LABELS,
  type TaskRow,
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
import { useProjects } from '../hooks/useProjects';
import { useMyTasks } from '../hooks/useTasks';
import { errorMessage } from '../lib/api';
import { formatDateTime } from '../lib/dates';

const columnHelper = createColumnHelper<TaskRow>();

const VIEW_PRESETS: Array<{
  label: string;
  status?: string;
  due?: 'overdue' | 'today' | 'upcoming';
}> = [
  { label: 'All' },
  { label: 'Today', due: 'today' },
  { label: 'Upcoming', due: 'upcoming' },
  { label: 'Overdue', due: 'overdue' },
  { label: 'In Progress', status: 'in_progress' },
  { label: 'Awaiting Approval', status: 'awaiting_approval' },
  { label: 'Blocked', status: 'blocked' },
  { label: 'Done', status: 'done' },
];

/** Personally assigned work with filters, sorting and pagination (Step 11). */
export function MyTasksPage() {
  const [preset, setPreset] = useState(0);
  const [clientId, setClientId] = useState('');
  const [projectId, setProjectId] = useState('');
  const [priority, setPriority] = useState('');
  const [search, setSearch] = useState('');
  const [sorting, setSorting] = useState<SortingState>([{ id: 'dueAt', desc: false }]);

  const active = VIEW_PRESETS[preset] ?? VIEW_PRESETS[0];
  const filters = useMemo(
    () => ({
      status: active?.status,
      due: active?.due,
      clientId: clientId === '' ? undefined : clientId,
      projectId: projectId === '' ? undefined : projectId,
      priority: priority === '' ? undefined : priority,
      search: search.trim() === '' ? undefined : search.trim(),
    }),
    [active, clientId, projectId, priority, search],
  );

  const tasks = useMyTasks(filters);
  const clients = useClients('');
  const projects = useProjects(clientId === '' ? {} : { clientId });

  const columns = useMemo(
    () => [
      columnHelper.accessor('title', {
        header: 'Task',
        cell: (info) => (
          <div>
            <Link
              to={`/tasks/${info.row.original.id}`}
              className="font-medium text-slate-900 hover:underline"
            >
              {info.row.original.parentTitle ? '↳ ' : ''}
              {info.getValue()}
            </Link>
            {info.row.original.parentTitle ? (
              <p className="text-xs text-slate-400">Subtask of {info.row.original.parentTitle}</p>
            ) : null}
          </div>
        ),
      }),
      columnHelper.accessor('clientName', { header: 'Client' }),
      columnHelper.accessor('projectName', { header: 'Project' }),
      columnHelper.accessor('dueAt', {
        header: 'Due',
        cell: (info) => (
          <span className={info.row.original.isOverdue ? 'font-medium text-red-700' : undefined}>
            {formatDateTime(info.getValue())}
            {info.row.original.isOverdue ? ' (overdue)' : ''}
          </span>
        ),
      }),
      columnHelper.accessor('priority', {
        header: 'Priority',
        cell: (info) => TASK_PRIORITY_LABELS[info.getValue()],
      }),
      columnHelper.accessor('status', {
        header: 'Status',
        cell: (info) => TASK_STATUS_LABELS[info.getValue()],
      }),
      columnHelper.accessor('approvalRequired', {
        header: 'Approval',
        cell: (info) => (info.getValue() ? 'Required' : '—'),
      }),
      columnHelper.display({
        id: 'flags',
        header: 'Flags',
        cell: (info) => {
          const row = info.row.original;
          const flags: string[] = [];

          if (row.needsAssignment) {
            flags.push('Needs assignment');
          }

          if (row.manualBlockReason) {
            flags.push(`Blocked: ${row.manualBlockReason}`);
          }

          if (row.reviewOpen) {
            flags.push('Review required');
          }

          return flags.length > 0 ? flags.join(' · ') : '—';
        },
      }),
    ],
    [],
  );

  const data = useMemo(() => tasks.data ?? [], [tasks.data]);

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
      <div>
        <h1 className="text-xl font-semibold tracking-tight">My Tasks</h1>
        <p className="mt-1 text-sm text-slate-500">Work assigned to you, across every client.</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {VIEW_PRESETS.map((view, index) => (
          <button
            key={view.label}
            type="button"
            onClick={() => setPreset(index)}
            className={[
              'rounded-full px-3 py-1.5 text-xs font-medium transition',
              index === preset
                ? 'bg-slate-900 text-white'
                : 'border border-slate-300 bg-white text-slate-600 hover:bg-slate-50',
            ].join(' ')}
          >
            {view.label}
          </button>
        ))}
      </div>

      <div className="grid max-w-3xl gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <TextField
          label="Search"
          name="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Filter by title"
        />
        <div className="space-y-1">
          <label htmlFor="my-client" className="block text-sm font-medium text-slate-700">
            Client
          </label>
          <select
            id="my-client"
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
          <label htmlFor="my-project" className="block text-sm font-medium text-slate-700">
            Project
          </label>
          <select
            id="my-project"
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
          <label htmlFor="my-priority" className="block text-sm font-medium text-slate-700">
            Priority
          </label>
          <select
            id="my-priority"
            value={priority}
            onChange={(event) => setPriority(event.target.value)}
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
          >
            <option value="">All priorities</option>
            {TASK_PRIORITIES.map((value) => (
              <option key={value} value={value}>
                {TASK_PRIORITY_LABELS[value]}
              </option>
            ))}
          </select>
        </div>
      </div>

      {tasks.isPending ? (
        <p className="text-sm text-slate-500">Loading your tasks…</p>
      ) : tasks.isError ? (
        <p className="text-sm text-red-600">{errorMessage(tasks.error)}</p>
      ) : data.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-300 bg-white px-4 py-6 text-center text-sm text-slate-500">
          Nothing here. Enjoy the quiet — or ask your manager about upcoming work.
        </p>
      ) : (
        <div className="space-y-3">
          <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
            <table className="w-full min-w-[56rem] text-left text-sm">
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
