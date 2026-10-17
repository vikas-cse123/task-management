import { hasCapability } from '@interscale/shared';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { TextField } from '../components/ui/TextField';
import { errorMessage } from '../lib/api';
import { useClients, useCreateClient } from '../hooks/useClients';
import { useSession } from '../hooks/useSession';

/** Client list with search and Admin-only creation (Step 5). */
export function ClientsPage() {
  const { user } = useSession();
  const [search, setSearch] = useState('');
  const [draft, setDraft] = useState('');
  const [showCreate, setShowCreate] = useState(false);

  const clients = useClients(search);
  const createClient = useCreateClient();

  const canCreate = user?.accessLevel === 'Admin';
  const canManageHint =
    user &&
    (user.accessLevel === 'Admin' ||
      hasCapability(user.accessLevel, user.capabilities, 'clients.manage'));

  const handleCreate = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();

    if (draft.trim().length === 0) {
      return;
    }

    try {
      await createClient.mutateAsync({ name: draft.trim(), status: 'active' });
      setDraft('');
      setShowCreate(false);
    } catch {
      // Surfaced below via createClient.error.
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Clients</h1>
          <p className="mt-1 text-sm text-slate-500">
            {user?.accessLevel === 'Admin'
              ? 'Every client workspace in the agency.'
              : 'Client workspaces you are assigned to.'}
          </p>
        </div>

        {canCreate ? (
          <button
            type="button"
            onClick={() => setShowCreate((value) => !value)}
            className="inline-flex items-center gap-1.5 rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-slate-700"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            New client
          </button>
        ) : null}
      </div>

      {showCreate && canCreate ? (
        <form
          onSubmit={handleCreate}
          className="space-y-3 rounded-lg border border-slate-200 bg-white p-4"
        >
          <TextField
            label="Client name"
            name="name"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Acme Corporation"
            maxLength={160}
          />
          {createClient.error ? (
            <p className="text-sm text-red-600">{errorMessage(createClient.error)}</p>
          ) : null}
          <button
            type="submit"
            disabled={createClient.isPending || draft.trim().length === 0}
            className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-slate-700 disabled:opacity-60"
          >
            {createClient.isPending ? 'Creating…' : 'Create client'}
          </button>
        </form>
      ) : null}

      <div className="max-w-sm">
        <TextField
          label="Search clients"
          name="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Type to filter by name"
        />
      </div>

      {clients.isPending ? (
        <p className="text-sm text-slate-500">Loading clients…</p>
      ) : clients.isError ? (
        <p className="text-sm text-red-600">{errorMessage(clients.error)}</p>
      ) : clients.data.length === 0 ? (
        <p className="text-sm text-slate-500">No clients found.</p>
      ) : (
        <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
          {clients.data.map((client) => (
            <li key={client.id}>
              <Link
                to={`/clients/${client.id}`}
                className="flex items-center justify-between gap-4 px-4 py-3 transition hover:bg-slate-50"
              >
                <div>
                  <p className="text-sm font-medium text-slate-900">{client.name}</p>
                  <p className="text-xs text-slate-500">
                    Status: {client.status}
                    {client.primaryManagerId ? ' · Has primary manager' : ' · No primary manager'}
                  </p>
                </div>
                <span className="text-xs font-medium text-slate-400">Open →</span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {!canManageHint ? (
        <p className="text-xs text-slate-400">
          Client settings are managed by Admins and Managers with the clients.manage capability.
        </p>
      ) : null}
    </div>
  );
}
