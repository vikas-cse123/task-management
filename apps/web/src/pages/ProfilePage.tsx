import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { TextField } from '../components/ui/TextField';
import { useJobRoles } from '../hooks/useEmployees';
import { useUpdateConsent } from '../hooks/useNotifications';
import { useRefreshSession, useSession } from '../hooks/useSession';
import { errorMessage } from '../lib/api';

/** Own profile: read-only details plus self-service WhatsApp consent (Phase 5). */
export function ProfilePage() {
  const { user } = useSession();
  const jobRoles = useJobRoles();
  const refresh = useRefreshSession();
  const updateConsent = useUpdateConsent();

  const [whatsappNumber, setWhatsappNumber] = useState('');
  const [optIn, setOptIn] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setWhatsappNumber(user?.whatsappNumber ?? '');
    setOptIn(user?.whatsappOptIn ?? false);
  }, [user?.whatsappNumber, user?.whatsappOptIn]);

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
  ];

  const handleConsentSubmit = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    setFormError(null);
    setSaved(false);

    const trimmed = whatsappNumber.trim();

    try {
      await updateConsent.mutateAsync({
        whatsappNumber: trimmed.length > 0 ? trimmed : null,
        whatsappOptIn: optIn,
      });
      await refresh();
      setSaved(true);
    } catch (caught) {
      setFormError(errorMessage(caught));
    }
  };

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Profile</h1>
        <p className="mt-1 text-sm text-slate-500">
          Your account details. Contact an Admin to change anything except your password and
          WhatsApp notifications.
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

      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold">WhatsApp notifications</h2>
          <p className="text-xs text-slate-500">
            Receive task assignments, deadline reminders, and escalations on WhatsApp. You can opt
            out at any time. In-app notifications are always available.
          </p>
        </div>

        <form
          onSubmit={handleConsentSubmit}
          className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4"
        >
          <TextField
            label="WhatsApp number (E.164)"
            name="whatsappNumber"
            value={whatsappNumber}
            onChange={(event) => setWhatsappNumber(event.target.value)}
            placeholder="+919812345678"
            hint="Include the country code, e.g. +919812345678."
          />
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={optIn}
              onChange={(event) => setOptIn(event.target.checked)}
              className="h-4 w-4 rounded border-slate-300"
            />
            Send me WhatsApp notifications
          </label>
          {formError ? <p className="text-sm text-red-600">{formError}</p> : null}
          {saved ? <p className="text-sm text-green-600">Consent updated.</p> : null}
          <div>
            <button
              type="submit"
              disabled={updateConsent.isPending}
              className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-slate-700 disabled:opacity-60"
            >
              {updateConsent.isPending ? 'Saving…' : 'Save consent'}
            </button>
          </div>
        </form>
      </section>

      <Link
        to="/change-password"
        className="inline-block rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
      >
        Change password
      </Link>
    </div>
  );
}
