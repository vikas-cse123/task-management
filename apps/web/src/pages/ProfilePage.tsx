import { Link } from 'react-router-dom';
import { useJobRoles } from '../hooks/useEmployees';
import { useSession } from '../hooks/useSession';

/** Own profile: read-only details plus WhatsApp opt-in state. */
export function ProfilePage() {
  const { user } = useSession();
  const jobRoles = useJobRoles();

  const roleNames = (user?.jobRoleIds ?? []).map(
    (id) => jobRoles.data?.find((role) => role.id === id)?.name ?? id,
  );

  const rows: Array<[string, string]> = [
    ['Name', user?.name ?? '—'],
    ['Email', user?.email ?? '—'],
    ['Access level', user?.accessLevel ?? '—'],
    ['Status', user?.status ?? '—'],
    ['Job roles', roleNames.length > 0 ? roleNames.join(', ') : '—'],
    [
      'Capabilities',
      user && user.capabilities.length > 0 ? user.capabilities.join(', ') : 'Default access',
    ],
    ['WhatsApp number', user?.whatsappNumber ?? '—'],
    ['WhatsApp opt-in', user?.whatsappOptIn ? 'Yes' : 'No'],
  ];

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Profile</h1>
        <p className="mt-1 text-sm text-slate-500">
          Your account details. Contact an Admin to change anything except your password.
        </p>
      </div>

      <dl className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-center justify-between gap-4 px-4 py-3">
            <dt className="text-xs font-medium tracking-wide text-slate-500 uppercase">{label}</dt>
            <dd className="text-right text-sm text-slate-900">{value}</dd>
          </div>
        ))}
      </dl>

      <Link
        to="/change-password"
        className="inline-block rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
      >
        Change password
      </Link>
    </div>
  );
}
