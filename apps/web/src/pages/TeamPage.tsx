import type { CreateEmployeeInput, UpdateEmployeeInput, UserProfile } from '@interscale/shared';
import { useState } from 'react';
import { EmployeeForm, toFormValues } from '../components/team/EmployeeForm';
import { FullPageSpinner } from '../components/ui/FullPageSpinner';
import {
  useCreateEmployee,
  useDepartments,
  useEmployees,
  useJobRoles,
  useRevokeEmployeeSessions,
  useUpdateEmployee,
} from '../hooks/useEmployees';
import { errorMessage } from '../lib/api';

function roleNames(employee: UserProfile, roles: { id: string; name: string }[]): string {
  const names = employee.jobRoleIds
    .map((id) => roles.find((role) => role.id === id)?.name)
    .filter((name): name is string => Boolean(name));

  return names.length > 0 ? names.join(', ') : '—';
}

function departmentNames(
  employee: UserProfile,
  roles: { id: string; departmentId: string }[],
  departments: { id: string; name: string }[],
): string {
  const names = new Set<string>();

  for (const roleId of employee.jobRoleIds) {
    const departmentId = roles.find((role) => role.id === roleId)?.departmentId;
    const name = departments.find((department) => department.id === departmentId)?.name;

    if (name) {
      names.add(name);
    }
  }

  return names.size > 0 ? [...names].join(', ') : '—';
}

export function TeamPage() {
  const employees = useEmployees();
  const jobRoles = useJobRoles();
  const departments = useDepartments();

  const createMutation = useCreateEmployee();
  const updateMutation = useUpdateEmployee();
  const revokeMutation = useRevokeEmployeeSessions();

  const [formMode, setFormMode] = useState<'create' | 'edit' | null>(null);
  const [editing, setEditing] = useState<UserProfile | null>(null);
  const [tempPassword, setTempPassword] = useState<{ email: string; password: string } | null>(
    null,
  );
  const [formError, setFormError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const roles = jobRoles.data ?? [];
  const departmentList = departments.data ?? [];

  const closeForm = (): void => {
    setFormMode(null);
    setEditing(null);
    setFormError(null);
  };

  const handleCreate = (input: CreateEmployeeInput): void => {
    setFormError(null);
    createMutation.mutate(input, {
      onSuccess: (result) => {
        setTempPassword({ email: result.user.email, password: result.temporaryPassword });
        closeForm();
      },
      onError: (error) => setFormError(errorMessage(error)),
    });
  };

  const handleEdit = (input: UpdateEmployeeInput): void => {
    if (!editing) return;
    setFormError(null);
    updateMutation.mutate(
      { id: editing.id, input },
      {
        onSuccess: () => closeForm(),
        onError: (error) => setFormError(errorMessage(error)),
      },
    );
  };

  const handleRevoke = (employee: UserProfile): void => {
    setActionError(null);
    revokeMutation.mutate(employee.id, {
      onError: (error) => setActionError(errorMessage(error)),
    });
  };

  if (employees.isLoading) {
    return <FullPageSpinner />;
  }

  return (
    <section className="space-y-6">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Team</h1>
          <p className="text-sm text-slate-600">
            Manage employee accounts, access levels and roles.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setEditing(null);
            setFormMode('create');
            setFormError(null);
          }}
          className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          Create employee
        </button>
      </header>

      {tempPassword ? (
        <div
          role="status"
          className="space-y-1 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900"
        >
          <p className="font-medium">Temporary password for {tempPassword.email} (shown once)</p>
          <p className="font-mono text-base">{tempPassword.password}</p>
          <p>
            Share it securely. The employee must change it on first login.{' '}
            <button type="button" className="underline" onClick={() => setTempPassword(null)}>
              Dismiss
            </button>
          </p>
        </div>
      ) : null}

      {actionError ? (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {actionError}
        </p>
      ) : null}

      {formMode ? (
        <EmployeeForm
          mode={formMode}
          initial={toFormValues(editing ?? undefined)}
          jobRoles={roles}
          submitting={createMutation.isPending || updateMutation.isPending}
          error={formError}
          onSubmitCreate={handleCreate}
          onSubmitEdit={handleEdit}
          onCancel={closeForm}
        />
      ) : null}

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full min-w-[48rem] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Employee</th>
              <th className="px-4 py-3">Access</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Department</th>
              <th className="px-4 py-3">Job roles</th>
              <th className="px-4 py-3">WhatsApp</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {(employees.data ?? []).map((employee) => (
              <tr key={employee.id}>
                <td className="px-4 py-3">
                  <p className="font-medium text-slate-800">{employee.name}</p>
                  <p className="text-xs text-slate-500">{employee.email}</p>
                </td>
                <td className="px-4 py-3">{employee.accessLevel}</td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                      employee.status === 'active'
                        ? 'bg-emerald-50 text-emerald-700'
                        : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {employee.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-slate-600">
                  {departmentNames(employee, roles, departmentList)}
                </td>
                <td className="px-4 py-3 text-slate-600">{roleNames(employee, roles)}</td>
                <td className="px-4 py-3 text-slate-600">
                  {employee.whatsappNumber ?? '—'}
                  <span className="block text-xs text-slate-400">
                    {employee.whatsappOptIn ? 'opt-in' : 'no opt-in'}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setEditing(employee);
                        setFormMode('edit');
                        setFormError(null);
                      }}
                      className="rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRevoke(employee)}
                      className="rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                    >
                      Revoke sessions
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {(employees.data ?? []).length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-sm text-slate-500">
                  No employees yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {employees.isError ? (
        <p className="text-sm text-red-600">{errorMessage(employees.error)}</p>
      ) : null}
    </section>
  );
}
