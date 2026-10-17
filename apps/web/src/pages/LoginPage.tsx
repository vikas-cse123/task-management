import { APP_NAME, loginInputSchema } from '@interscale/shared';
import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { FullPageSpinner } from '../components/ui/FullPageSpinner';
import { TextField } from '../components/ui/TextField';
import { useRefreshSession, useSession } from '../hooks/useSession';
import { ApiClientError } from '../lib/api';
import { signIn } from '../lib/auth-api';

interface LocationState {
  readonly from?: string;
}

export function LoginPage() {
  const { user, isLoading } = useSession();
  const refresh = useRefreshSession();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (isLoading) {
    return <FullPageSpinner />;
  }

  if (user) {
    return <Navigate to={user.requiresPasswordChange ? '/change-password' : '/'} replace />;
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setError(null);

    const parsed = loginInputSchema.safeParse({ email, password });

    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Enter a valid email and password');
      return;
    }

    setSubmitting(true);

    try {
      await signIn(parsed.data.email, parsed.data.password);
      await refresh();

      const state = location.state as LocationState | null;
      const target = state?.from && state.from !== '/login' ? state.from : '/';
      navigate(target, { replace: true });
    } catch (caught) {
      setError(
        caught instanceof ApiClientError ? caught.message : 'Sign in failed. Please try again.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 space-y-1 text-center">
          <h1 className="text-lg font-semibold text-slate-900">{APP_NAME}</h1>
          <p className="text-sm text-slate-500">Sign in with your work account</p>
        </div>

        <form
          onSubmit={handleSubmit}
          noValidate
          className="space-y-4 rounded-lg border border-slate-200 bg-white p-6 shadow-sm"
        >
          <TextField
            label="Email"
            name="email"
            type="email"
            autoComplete="username"
            autoFocus
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />

          <TextField
            label="Password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
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
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className="mt-4 text-center text-xs text-slate-500">
          Accounts are created by an administrator. There is no self sign-up.
        </p>
      </div>
    </div>
  );
}
