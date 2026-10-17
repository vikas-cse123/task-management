import { CLIENT_STATUSES, CLIENT_TEAM_ROLES, hasCapability } from '@interscale/shared';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { MeetingLinkList } from '../components/meetings/MeetingLinkList';
import { TextField } from '../components/ui/TextField';
import { useEmployees, useJobRoles } from '../hooks/useEmployees';
import { useClientMeetings } from '../hooks/useMeetings';
import { useClientProjects } from '../hooks/useProjects';
import {
  useAssignClientRole,
  useClient,
  useClientRoles,
  useClientTeam,
  useRemoveClientRole,
  useRemoveClientTeamMember,
  useSetClientTeamMember,
  useUpdateClient,
} from '../hooks/useClients';
import { useSession } from '../hooks/useSession';
import { errorMessage } from '../lib/api';

function usePermissions() {
  const { user } = useSession();
  const isAdmin = user?.accessLevel === 'Admin';

  return {
    isAdmin: isAdmin ?? false,
    canManage:
      isAdmin === true ||
      hasCapability(user?.accessLevel ?? 'Employee', user?.capabilities, 'clients.manage'),
    canManageTeam:
      isAdmin === true ||
      hasCapability(user?.accessLevel ?? 'Employee', user?.capabilities, 'clients.team.manage'),
  };
}

/** Client workspace: settings, team membership and designated roles (Step 5). */
export function ClientDetailPage() {
  const { id } = useParams();
  const clientId = id ?? '';

  const client = useClient(clientId);
  const team = useClientTeam(clientId);
  const roles = useClientRoles(clientId);
  const clientProjects = useClientProjects(clientId);
  const clientMeetings = useClientMeetings(clientId);
  const updateClient = useUpdateClient(clientId);
  const setMember = useSetClientTeamMember(clientId);
  const removeMember = useRemoveClientTeamMember(clientId);
  const assignRole = useAssignClientRole(clientId);
  const removeRole = useRemoveClientRole(clientId);

  const { isAdmin, canManage, canManageTeam } = usePermissions();
  const employees = useEmployees(isAdmin);
  const jobRoles = useJobRoles();

  const [name, setName] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [primaryManagerId, setPrimaryManagerId] = useState<string | null | undefined>(undefined);
  const [memberUserId, setMemberUserId] = useState('');
  const [roleJobRoleId, setRoleJobRoleId] = useState('');
  const [roleUserId, setRoleUserId] = useState('');
  const [roleIsPrimary, setRoleIsPrimary] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const employeeName = (userId: string): string => {
    const found = employees.data?.find((employee) => employee.id === userId);
    return found ? `${found.name} (${found.email})` : userId;
  };

  const jobRoleName = (jobRoleId: string): string => {
    const found = jobRoles.data?.find((role) => role.id === jobRoleId);
    return found ? found.name : jobRoleId;
  };

  if (client.isPending) {
    return <p className="text-sm text-slate-500">Loading client…</p>;
  }

  if (client.isError || !client.data) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-red-600">{errorMessage(client.error, 'Client not found.')}</p>
        <Link to="/clients" className="text-sm font-medium text-slate-700 underline">
          Back to clients
        </Link>
      </div>
    );
  }

  const current = client.data;
  const draftName = name ?? current.name;
  const draftStatus = status ?? current.status;
  const draftPrimary =
    primaryManagerId === undefined ? (current.primaryManagerId ?? '') : (primaryManagerId ?? '');

  const handleSave = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    setActionError(null);

    try {
      await updateClient.mutateAsync({
        name: draftName.trim(),
        status: draftStatus as typeof current.status,
        primaryManagerId: draftPrimary === '' ? null : draftPrimary,
      });
      setName(null);
      setStatus(null);
      setPrimaryManagerId(undefined);
    } catch (error) {
      setActionError(errorMessage(error));
    }
  };

  const handleAddMember = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    setActionError(null);

    if (memberUserId.trim().length === 0) {
      return;
    }

    try {
      await setMember.mutateAsync({ userId: memberUserId.trim(), input: { isActive: true } });
      setMemberUserId('');
    } catch (error) {
      setActionError(errorMessage(error));
    }
  };

  const handleAssignRole = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    setActionError(null);

    if (roleJobRoleId.length === 0 || roleUserId.trim().length === 0) {
      return;
    }

    try {
      await assignRole.mutateAsync({
        jobRoleId: roleJobRoleId,
        userId: roleUserId.trim(),
        isPrimary: roleIsPrimary,
      });
      setRoleJobRoleId('');
      setRoleUserId('');
      setRoleIsPrimary(false);
    } catch (error) {
      setActionError(errorMessage(error));
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <Link to="/clients" className="text-xs font-medium text-slate-500 underline">
          ← Back to clients
        </Link>
        <h1 className="mt-1 text-xl font-semibold tracking-tight">{current.name}</h1>
        <p className="mt-1 text-sm text-slate-500">
          Status: {current.status}
          {current.primaryManagerId
            ? ` · Primary manager: ${employeeName(current.primaryManagerId)}`
            : ' · No primary manager assigned'}
        </p>
      </div>

      {actionError ? <p className="text-sm text-red-600">{actionError}</p> : null}

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Projects</h2>
          <Link to="/projects" className="text-xs font-medium text-slate-600 underline">
            All projects
          </Link>
        </div>
        {clientProjects.isPending ? (
          <p className="text-sm text-slate-500">Loading projects…</p>
        ) : clientProjects.isError ? (
          <p className="text-sm text-red-600">{errorMessage(clientProjects.error)}</p>
        ) : (clientProjects.data ?? []).length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-300 bg-white px-4 py-6 text-center text-sm text-slate-500">
            No projects for this client yet.
          </p>
        ) : (
          <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
            {(clientProjects.data ?? []).map((project) => (
              <li key={project.id}>
                <Link
                  to={`/projects/${project.id}`}
                  className="flex items-center justify-between gap-4 px-4 py-3 transition hover:bg-slate-50"
                >
                  <div>
                    <p className="text-sm font-medium text-slate-900">{project.name}</p>
                    <p className="text-xs text-slate-500">
                      {project.type} · {project.status}
                    </p>
                  </div>
                  <span className="text-xs font-medium text-slate-400">Open →</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Meetings</h2>
          <Link to="/meetings" className="text-xs font-medium text-slate-600 underline">
            All meetings
          </Link>
        </div>
        <MeetingLinkList
          meetings={clientMeetings.data}
          isPending={clientMeetings.isPending}
          isError={clientMeetings.isError}
          error={clientMeetings.error}
          emptyText="No meetings for this client yet."
        />
      </section>

      {canManage ? (
        <section className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-semibold">Client settings</h2>
          <form onSubmit={handleSave} className="grid max-w-xl gap-3">
            <TextField
              label="Client name"
              name="name"
              value={draftName}
              onChange={(event) => setName(event.target.value)}
              maxLength={160}
            />
            <div className="space-y-1">
              <label htmlFor="client-status" className="block text-sm font-medium text-slate-700">
                Status
              </label>
              <select
                id="client-status"
                value={draftStatus}
                onChange={(event) => setStatus(event.target.value)}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
              >
                {CLIENT_STATUSES.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label htmlFor="client-primary" className="block text-sm font-medium text-slate-700">
                Primary manager
              </label>
              {isAdmin && employees.data ? (
                <select
                  id="client-primary"
                  value={draftPrimary}
                  onChange={(event) => setPrimaryManagerId(event.target.value || null)}
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
                >
                  <option value="">None</option>
                  {employees.data.map((employee) => (
                    <option key={employee.id} value={employee.id}>
                      {employee.name} ({employee.email})
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  id="client-primary"
                  value={draftPrimary}
                  onChange={(event) => setPrimaryManagerId(event.target.value || null)}
                  placeholder="User id, empty for none"
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
                />
              )}
              <p className="text-xs text-slate-500">
                Assigning a primary manager also activates their team membership.
              </p>
            </div>
            {updateClient.error ? (
              <p className="text-sm text-red-600">{errorMessage(updateClient.error)}</p>
            ) : null}
            <button
              type="submit"
              disabled={updateClient.isPending}
              className="w-fit rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-slate-700 disabled:opacity-60"
            >
              {updateClient.isPending ? 'Saving…' : 'Save settings'}
            </button>
          </form>
        </section>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Team members</h2>
        {team.isPending ? (
          <p className="text-sm text-slate-500">Loading team…</p>
        ) : team.isError ? (
          <p className="text-sm text-red-600">{errorMessage(team.error)}</p>
        ) : team.data.length === 0 ? (
          <p className="text-sm text-slate-500">No team members yet.</p>
        ) : (
          <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
            {team.data.map((member) => (
              <li key={member.id} className="flex items-center justify-between gap-4 px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-slate-900">
                    {employeeName(member.userId)}
                  </p>
                  <p className="text-xs text-slate-500">
                    {member.roleInTeam} · {member.isActive ? 'active' : 'inactive'}
                  </p>
                </div>
                {canManageTeam ? (
                  <div className="flex items-center gap-2">
                    <select
                      aria-label={`Team role for ${employeeName(member.userId)}`}
                      value={member.roleInTeam}
                      onChange={(event) => {
                        setActionError(null);
                        void setMember
                          .mutateAsync({
                            userId: member.userId,
                            input: {
                              roleInTeam: event.target.value as (typeof CLIENT_TEAM_ROLES)[number],
                            },
                          })
                          .catch((error: unknown) => setActionError(errorMessage(error)));
                      }}
                      className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs"
                    >
                      {CLIENT_TEAM_ROLES.map((value) => (
                        <option key={value} value={value}>
                          {value}
                        </option>
                      ))}
                    </select>
                    {member.isActive ? (
                      <button
                        type="button"
                        onClick={() => {
                          setActionError(null);
                          void removeMember
                            .mutateAsync(member.userId)
                            .catch((error: unknown) => setActionError(errorMessage(error)));
                        }}
                        className="rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                      >
                        Deactivate
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setActionError(null);
                          void setMember
                            .mutateAsync({ userId: member.userId, input: { isActive: true } })
                            .catch((error: unknown) => setActionError(errorMessage(error)));
                        }}
                        className="rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                      >
                        Reactivate
                      </button>
                    )}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}

        {canManageTeam ? (
          <form
            onSubmit={handleAddMember}
            className="flex max-w-xl flex-wrap items-end gap-2 rounded-lg border border-slate-200 bg-white p-4"
          >
            {isAdmin && employees.data ? (
              <div className="min-w-52 flex-1 space-y-1">
                <label htmlFor="member-user" className="block text-sm font-medium text-slate-700">
                  Employee
                </label>
                <select
                  id="member-user"
                  value={memberUserId}
                  onChange={(event) => setMemberUserId(event.target.value)}
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
                >
                  <option value="">Select employee…</option>
                  {employees.data.map((employee) => (
                    <option key={employee.id} value={employee.id}>
                      {employee.name} ({employee.email})
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="min-w-52 flex-1">
                <TextField
                  label="Employee user id"
                  name="memberUserId"
                  value={memberUserId}
                  onChange={(event) => setMemberUserId(event.target.value)}
                  placeholder="24-character user id"
                />
              </div>
            )}
            <button
              type="submit"
              disabled={setMember.isPending || memberUserId.trim().length === 0}
              className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-slate-700 disabled:opacity-60"
            >
              {setMember.isPending ? 'Adding…' : 'Add member'}
            </button>
          </form>
        ) : null}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Designated roles</h2>
        {roles.isPending ? (
          <p className="text-sm text-slate-500">Loading designations…</p>
        ) : roles.isError ? (
          <p className="text-sm text-red-600">{errorMessage(roles.error)}</p>
        ) : roles.data.length === 0 ? (
          <p className="text-sm text-slate-500">No designated employees yet.</p>
        ) : (
          <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
            {roles.data.map((assignment) => (
              <li key={assignment.id} className="flex items-center justify-between gap-4 px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-slate-900">
                    {jobRoleName(assignment.jobRoleId)} — {employeeName(assignment.userId)}
                  </p>
                  <p className="text-xs text-slate-500">
                    {assignment.isPrimary ? 'primary · ' : ''}
                    {assignment.isActive ? 'active' : 'inactive'}
                  </p>
                </div>
                {canManageTeam && assignment.isActive ? (
                  <button
                    type="button"
                    onClick={() => {
                      setActionError(null);
                      void removeRole
                        .mutateAsync(assignment.id)
                        .catch((error: unknown) => setActionError(errorMessage(error)));
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

        {canManageTeam ? (
          <form
            onSubmit={handleAssignRole}
            className="grid max-w-xl gap-2 rounded-lg border border-slate-200 bg-white p-4"
          >
            <div className="space-y-1">
              <label htmlFor="role-job" className="block text-sm font-medium text-slate-700">
                Job role
              </label>
              <select
                id="role-job"
                value={roleJobRoleId}
                onChange={(event) => setRoleJobRoleId(event.target.value)}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
              >
                <option value="">Select job role…</option>
                {jobRoles.data?.map((role) => (
                  <option key={role.id} value={role.id}>
                    {role.name}
                  </option>
                ))}
              </select>
            </div>
            <TextField
              label="Employee user id"
              name="roleUserId"
              value={roleUserId}
              onChange={(event) => setRoleUserId(event.target.value)}
              placeholder="24-character user id"
              hint="The employee must be active and hold the selected job role."
            />
            <label className="inline-flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={roleIsPrimary}
                onChange={(event) => setRoleIsPrimary(event.target.checked)}
                className="h-4 w-4"
              />
              Primary designated employee for this role
            </label>
            <button
              type="submit"
              disabled={
                assignRole.isPending || roleJobRoleId.length === 0 || roleUserId.trim().length === 0
              }
              className="w-fit rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-slate-700 disabled:opacity-60"
            >
              {assignRole.isPending ? 'Assigning…' : 'Designate employee'}
            </button>
          </form>
        ) : null}
      </section>
    </div>
  );
}
