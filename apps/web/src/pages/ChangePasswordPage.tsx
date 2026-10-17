import {
  PASSWORD_MIN_LENGTH,
  changePasswordInputSchema,
  type ChangePasswordInput,
} from '@interscale/shared';
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { TextField } from '../components/ui/TextField';
import { useRefreshSession, useSession } from '../hooks/useSession';
import { ApiClientError } from '../lib/api';
import { changePassword } from '../lib/auth-api';

export function ChangePasswordPage() {
  const { user } = useSession();
  const refresh = useRefreshSession();
  const navigate = useNavigate();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const forced = user?.requiresPasswordChange ?? false;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setError(null);

    if (newPassword !== confirmPassword) {
      setError('The new passwords do not match');
      return;
    }

    const parsed = changePasswordInputSchema.safeParse({ currentPassword, newPassword });

    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Check the form and try again');
      return;
    }

    setSubmitting(true);

    try {
      await changePassword(parsed.data satisfies ChangePasswordInput);
      await refresh();
      navigate('/', { replace: true });
    } catch (caught) {
      setError(
        caught instanceof ApiClientError
          ? caught.message
          : 'Unable to change your password. Please try again.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 space-y-1 text-center">
          <h1 className="text-lg font-semibold text-slate-900">Change password</h1>
          <p className="text-sm text-slate-500">
            {forced
              ? 'You must set a new password before continuing.'
              : 'Choose a new password for your account.'}
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          noValidate
          className="space-y-4 rounded-lg border border-slate-200 bg-white p-6 shadow-sm"
        >
          <TextField
            label="Current password"
            name="currentPassword"
            type="password"
            autoComplete="current-password"
            autoFocus
            required
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
          />

          <TextField
            label="New password"
            name="newPassword"
            type="password"
            autoComplete="new-password"
            required
            hint={`At least ${PASSWORD_MIN_LENGTH} characters`}
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
          />

          <TextField
            label="Confirm new password"
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            required
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
          />

          {error ? (
            <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? 'Saving…' : 'Change password'}
          </button>
        </form>
      </div>
    </div>
  );
}
