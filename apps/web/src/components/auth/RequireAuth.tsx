import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useSession } from '../../hooks/useSession';
import { FullPageSpinner } from '../ui/FullPageSpinner';

/**
 * Route guard.
 *
 * - unauthenticated users are sent to `/login`;
 * - users who must still change their temporary password are pinned to
 *   `/change-password` until the change succeeds.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, isLoading } = useSession();
  const location = useLocation();

  if (isLoading) {
    return <FullPageSpinner />;
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (user.requiresPasswordChange && location.pathname !== '/change-password') {
    return <Navigate to="/change-password" replace />;
  }

  return <>{children}</>;
}
