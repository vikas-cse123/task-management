import { useState } from 'react';
import { NotificationSettingsSection } from '../components/settings/NotificationSettingsSection';
import { TextField } from '../components/ui/TextField';
import {
  useDepartments,
  useJobRoles,
  useUpdateDepartment,
  useUpdateJobRole,
} from '../hooks/useEmployees';
import { errorMessage } from '../lib/api';

interface Editable {
  id: string;
  key: string;
  name: string;
  description: string | null;
}

function ReferenceSection({
  title,
  hint,
  items,
  isPending,
  isError,
  error,
  onSave,
  saving,
}: {
  title: string;
  hint: string;
  items: Editable[];
  isPending: boolean;
  isError: boolean;
  error: unknown;
  onSave: (id: string, patch: { name?: string; description?: string | null }) => Promise<void>;
  saving: boolean;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const startEdit = (item: Editable): void => {
    setEditingId(item.id);
    setName(item.name);
    setDescription(item.description ?? '');
    setFormError(null);
  };

  const handleSave = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();

    if (!editingId) {
      return;
    }

    setFormError(null);

    try {
      await onSave(editingId, {
        name: name.trim(),
        description: description.trim().length > 0 ? description.trim() : null,
      });
      setEditingId(null);
    } catch (caught) {
      setFormError(errorMessage(caught));
    }
  };

  if (isPending) {
    return <p className="text-sm text-slate-500">Loading {title.toLowerCase()}…</p>;
  }

  if (isError) {
    return <p className="text-sm text-red-600">{errorMessage(error)}</p>;
  }

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-sm font-semibold">{title}</h2>
        <p className="text-xs text-slate-500">{hint}</p>
      </div>

      <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
        {items.map((item) =>
          editingId === item.id ? (
            <li key={item.id} className="px-4 py-3">
              <form onSubmit={handleSave} className="grid max-w-xl gap-2">
                <TextField
                  label="Display name"
                  name={`name-${item.id}`}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  maxLength={160}
                />
                <TextField
                  label="Description"
                  name={`description-${item.id}`}
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  maxLength={2000}
                />
                {formError ? <p className="text-sm text-red-600">{formError}</p> : null}
                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={saving || name.trim().length === 0}
                    className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-slate-700 disabled:opacity-60"
                  >
                    {saving ? 'Saving…' : 'Save'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingId(null)}
                    className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </li>
          ) : (
            <li key={item.id} className="flex items-center justify-between gap-4 px-4 py-3">
              <div>
                <p className="text-sm font-medium text-slate-900">{item.name}</p>
                <p className="text-xs text-slate-500">
                  Key: {item.key}
                  {item.description ? ` · ${item.description}` : ''}
                </p>
              </div>
              <button
                type="button"
                onClick={() => startEdit(item)}
                className="rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                Edit
              </button>
            </li>
          ),
        )}
      </ul>
    </section>
  );
}

/** Reference-data settings (Admin only): department and job-role labels. */
export function SettingsPage() {
  const departments = useDepartments();
  const jobRoles = useJobRoles();
  const updateDepartment = useUpdateDepartment();
  const updateJobRole = useUpdateJobRole();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-slate-500">
          Display names and descriptions for departments and functional job roles. Keys and
          relationships never change.
        </p>
      </div>

      <ReferenceSection
        title="Departments"
        hint="Seeded reference data; only labels are editable."
        items={(departments.data ?? []).map((department) => ({ ...department }))}
        isPending={departments.isPending}
        isError={departments.isError}
        error={departments.error}
        saving={updateDepartment.isPending}
        onSave={async (id, patch) => {
          await updateDepartment.mutateAsync({ id, patch });
        }}
      />

      <ReferenceSection
        title="Job roles"
        hint="Functional roles assigned to employees and client designations."
        items={(jobRoles.data ?? []).map((role) => ({ ...role }))}
        isPending={jobRoles.isPending}
        isError={jobRoles.isError}
        error={jobRoles.error}
        saving={updateJobRole.isPending}
        onSave={async (id, patch) => {
          await updateJobRole.mutateAsync({ id, patch });
        }}
      />

      <NotificationSettingsSection />
    </div>
  );
}
