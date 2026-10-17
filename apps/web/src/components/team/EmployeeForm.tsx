import {
  ACCESS_LEVELS,
  CAPABILITIES,
  type AccessLevel,
  type Capability,
  type CreateEmployeeInput,
  type UpdateEmployeeInput,
  type UserProfile,
} from '@interscale/shared';
import { useState, type FormEvent } from 'react';
import { TextField } from '../ui/TextField';

export interface EmployeeFormValues {
  name: string;
  email: string;
  accessLevel: AccessLevel;
  status: 'active' | 'inactive';
  jobRoleIds: string[];
  capabilities: Capability[];
  whatsappNumber: string;
  whatsappOptIn: boolean;
}

export function toFormValues(employee?: UserProfile): EmployeeFormValues {
  return {
    name: employee?.name ?? '',
    email: employee?.email ?? '',
    accessLevel: employee?.accessLevel ?? 'Employee',
    status: employee?.status ?? 'active',
    jobRoleIds: employee?.jobRoleIds ?? [],
    capabilities: employee?.capabilities ?? [],
    whatsappNumber: employee?.whatsappNumber ?? '',
    whatsappOptIn: employee?.whatsappOptIn ?? false,
  };
}

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

interface EmployeeFormProps {
  mode: 'create' | 'edit';
  initial: EmployeeFormValues;
  jobRoles: { id: string; name: string }[];
  submitting: boolean;
  error: string | null;
  onSubmitCreate: (input: CreateEmployeeInput) => void;
  onSubmitEdit: (input: UpdateEmployeeInput) => void;
  onCancel: () => void;
}

export function EmployeeForm({
  mode,
  initial,
  jobRoles,
  submitting,
  error,
  onSubmitCreate,
  onSubmitEdit,
  onCancel,
}: EmployeeFormProps) {
  const [values, setValues] = useState<EmployeeFormValues>(initial);

  const update = (patch: Partial<EmployeeFormValues>): void =>
    setValues((current) => ({ ...current, ...patch }));

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();

    const whatsappNumber = values.whatsappNumber.trim();
    const shared = {
      accessLevel: values.accessLevel,
      jobRoleIds: values.jobRoleIds,
      capabilities: values.capabilities,
      whatsappNumber: whatsappNumber.length > 0 ? whatsappNumber : null,
      whatsappOptIn: values.whatsappOptIn,
    };

    if (mode === 'create') {
      onSubmitCreate({ name: values.name, email: values.email, ...shared });
      return;
    }

    onSubmitEdit({ name: values.name, status: values.status, ...shared });
  };

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      className="space-y-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="Name"
          name="name"
          required
          value={values.name}
          onChange={(event) => update({ name: event.target.value })}
        />
        <TextField
          label="Email"
          name="email"
          type="email"
          required
          disabled={mode === 'edit'}
          value={values.email}
          onChange={(event) => update({ email: event.target.value })}
          hint={mode === 'edit' ? 'Email cannot be changed' : undefined}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1">
          <label htmlFor="accessLevel" className="block text-sm font-medium text-slate-700">
            Access level
          </label>
          <select
            id="accessLevel"
            value={values.accessLevel}
            onChange={(event) => update({ accessLevel: event.target.value as AccessLevel })}
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
          >
            {ACCESS_LEVELS.map((level) => (
              <option key={level} value={level}>
                {level}
              </option>
            ))}
          </select>
        </div>

        {mode === 'edit' ? (
          <div className="space-y-1">
            <label htmlFor="status" className="block text-sm font-medium text-slate-700">
              Status
            </label>
            <select
              id="status"
              value={values.status}
              onChange={(event) => update({ status: event.target.value as 'active' | 'inactive' })}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
        ) : null}
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-slate-700">Job roles</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {jobRoles.map((role) => (
            <label key={role.id} className="flex items-center gap-2 text-sm text-slate-600">
              <input
                type="checkbox"
                checked={values.jobRoleIds.includes(role.id)}
                onChange={() => update({ jobRoleIds: toggle(values.jobRoleIds, role.id) })}
              />
              {role.name}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-slate-700">Capabilities</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {CAPABILITIES.map((capability) => (
            <label key={capability} className="flex items-center gap-2 text-sm text-slate-600">
              <input
                type="checkbox"
                checked={values.capabilities.includes(capability)}
                onChange={() => update({ capabilities: toggle(values.capabilities, capability) })}
              />
              {capability}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="WhatsApp number"
          name="whatsappNumber"
          placeholder="+919876543210"
          value={values.whatsappNumber}
          onChange={(event) => update({ whatsappNumber: event.target.value })}
          hint="Optional. E.164 format."
        />
        <label className="flex items-center gap-2 pt-6 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={values.whatsappOptIn}
            onChange={(event) => update({ whatsappOptIn: event.target.checked })}
          />
          WhatsApp notifications opt-in
        </label>
      </div>

      {error ? (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
        >
          {submitting ? 'Saving…' : mode === 'create' ? 'Create employee' : 'Save changes'}
        </button>
      </div>
    </form>
  );
}
