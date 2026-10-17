import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useSession } from '../../hooks/useSession';
import { FullPageSpinner } from '../ui/FullPageSpinner';

/** Restrict a route to the Admin access level (server also enforces this). */
export function RequireAdmin({ children }: { children: ReactNode }) {
  const { user, isLoading } = useSession();

  if (isLoading) {
    return <FullPageSpinner />;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (user.accessLevel !== 'Admin') {
    return <Navigate to="/forbidden" replace />;
  }

  return <>{children}</>;
}
