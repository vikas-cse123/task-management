import { Link } from 'react-router-dom';
import { FullPageSpinner } from '../components/ui/FullPageSpinner';
import { useClients } from '../hooks/useClients';
import { useEmployees, useJobRoles } from '../hooks/useEmployees';
import { useDashboardSummary } from '../hooks/useTasks';
import { useSession } from '../hooks/useSession';
import { errorMessage } from '../lib/api';

/**
 * Overview dashboard (Steps 6 + 11).
 *
 * Every figure comes from the live scoped summary endpoint: Admins see
 * agency-wide numbers, Managers see their assigned clients, and Employees see
 * their own work plus assigned-client context. No statistics are fabricated.
 */
export function HomePage() {
  const { user } = useSession();
  const isAdmin = user?.accessLevel === 'Admin';
  const isEmployee = user?.accessLevel === 'Employee';

  const summary = useDashboardSummary();
  const clients = useClients('');
  const employees = useEmployees(isAdmin ?? false);
  const jobRoles = useJobRoles();

  const roleName = (jobRoleId: string): string =>
    jobRoles.data?.find((role) => role.id === jobRoleId)?.name ?? jobRoleId;

  if (summary.isPending || clients.isPending || (isAdmin && employees.isPending)) {
    return <FullPageSpinner />;
  }

  if (summary.isError) {
    return <p className="text-sm text-red-600">{errorMessage(summary.error)}</p>;
  }

  const data = summary.data;
  const visibleClients = clients.data ?? [];

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {user ? `Welcome, ${user.name}` : 'Welcome'}
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Signed in as <span className="font-medium">{user?.accessLevel}</span>
          {user && user.jobRoleIds.length > 0
            ? ` · ${user.jobRoleIds.map(roleName).join(', ')}`
            : ''}
          .
        </p>
      </div>

      {user?.requiresPasswordChange ? (
        <div
          role="status"
          className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900"
        >
          You are using a temporary password.{' '}
          <Link to="/change-password" className="font-medium underline">
            Change it now
          </Link>{' '}
          to unlock the workspace.
        </div>
      ) : null}

      {isEmployee ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <StatCard label="Due today" value={data.myWork.dueToday} />
          <StatCard label="Overdue" value={data.myWork.overdue} accent={data.myWork.overdue > 0} />
          <StatCard label="Blocked" value={data.myWork.blocked} />
          <StatCard label="Awaiting approval" value={data.myWork.awaitingApproval} />
          <StatCard label="Done" value={data.myWork.done} />
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Active clients"
            value={data.clients.active}
            sub={`${data.clients.total} total`}
          />
          <StatCard
            label="Open projects"
            value={data.projects.open}
            sub={`${data.projects.total} total`}
          />
          <StatCard
            label="Overdue tasks"
            value={data.tasks.overdue}
            accent={data.tasks.overdue > 0}
          />
          <StatCard label="Pending approvals" value={data.approvalsPending} />
          <StatCard label="Due today" value={data.tasks.dueToday} />
          <StatCard label="Blocked tasks" value={data.tasks.blocked} />
          <StatCard label="Completed work" value={data.tasks.done} />
          <StatCard
            label="Clients without a primary manager"
            value={data.clients.withoutManager}
            sub="Assign one from the client page"
          />
        </div>
      )}

      {!isEmployee && data.workloadByEmployee.length > 0 ? (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold">Workload by employee</h2>
          <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
            {data.workloadByEmployee.slice(0, 8).map((row) => (
              <li key={row.userId} className="flex items-center justify-between gap-4 px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-slate-900">{row.name}</p>
                  <p className="text-xs text-slate-500">{row.email}</p>
                </div>
                <p className="text-xs text-slate-500">
                  {row.open} open{row.overdue > 0 ? ` · ${row.overdue} overdue` : ''}
                </p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {!isEmployee && data.workloadByRole.length > 0 ? (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold">Workload by functional role</h2>
          <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
            {data.workloadByRole.map((row) => (
              <li key={row.jobRoleId} className="flex items-center justify-between gap-4 px-4 py-3">
                <p className="text-sm font-medium text-slate-900">{row.name}</p>
                <p className="text-xs text-slate-500">
                  {row.open} open{row.overdue > 0 ? ` · ${row.overdue} overdue` : ''}
                </p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">{isAdmin ? 'Recent clients' : 'My clients'}</h2>
          <Link to="/clients" className="text-xs font-medium text-slate-600 underline">
            View all
          </Link>
        </div>

        {clients.isError ? (
          <p className="text-sm text-red-600">{errorMessage(clients.error)}</p>
        ) : visibleClients.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-300 bg-white px-4 py-6 text-center text-sm text-slate-500">
            {isAdmin
              ? 'No clients yet. Create the first one from the Clients page.'
              : 'You are not assigned to any client yet. Ask an Admin to add you to a client team.'}
          </p>
        ) : (
          <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
            {visibleClients.slice(0, 6).map((client) => (
              <li key={client.id}>
                <Link
                  to={`/clients/${client.id}`}
                  className="flex items-center justify-between gap-4 px-4 py-3 transition hover:bg-slate-50"
                >
                  <div>
                    <p className="text-sm font-medium text-slate-900">{client.name}</p>
                    <p className="text-xs text-slate-500">
                      {client.status}
                      {client.primaryManagerId ? '' : ' · No primary manager'}
                    </p>
                  </div>
                  <span className="text-xs font-medium text-slate-400">Open →</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function StatCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: number;
  sub?: string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <p className="text-xs font-medium tracking-wide text-slate-500 uppercase">{label}</p>
      <p className={`mt-1 text-3xl font-semibold ${accent ? 'text-red-700' : ''}`}>{value}</p>
      {sub ? <p className="mt-1 text-xs text-slate-500">{sub}</p> : null}
    </div>
  );
}
