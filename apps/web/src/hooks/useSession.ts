import type { UserProfile } from '@interscale/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchCurrentUser } from '../lib/auth-api';

export const SESSION_QUERY_KEY = ['session'] as const;

export interface Session {
  readonly user: UserProfile | null;
  readonly isLoading: boolean;
  readonly isError: boolean;
}

/**
 * Current session state.
 *
 * The profile (including `requiresPasswordChange`, `accessLevel` and
 * `status`) is always read from the server through `GET /api/v1/me`; nothing
 * security-relevant is trusted from the client.
 */
export function useSession(): Session {
  const query = useQuery({
    queryKey: SESSION_QUERY_KEY,
    queryFn: fetchCurrentUser,
    retry: false,
    staleTime: 30_000,
  });

  return { user: query.data ?? null, isLoading: query.isLoading, isError: query.isError };
}

/** Re-fetch the session (after sign-in, sign-out or a profile change). */
export function useRefreshSession(): () => Promise<void> {
  const queryClient = useQueryClient();

  return async () => {
    await queryClient.invalidateQueries({ queryKey: SESSION_QUERY_KEY });
  };
}
