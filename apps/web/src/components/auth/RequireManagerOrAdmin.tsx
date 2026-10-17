import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useSession } from '../../hooks/useSession';
import { FullPageSpinner } from '../ui/FullPageSpinner';

/** Restrict a route to Admin or Manager (Employees never see templates). */
export function RequireManagerOrAdmin({ children }: { children: ReactNode }) {
  const { user, isLoading } = useSession();

  if (isLoading) {
    return <FullPageSpinner />;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (user.accessLevel === 'Employee') {
    return <Navigate to="/forbidden" replace />;
  }

  return <>{children}</>;
}
