import {
  API_PREFIX,
  AUTH_BASE_PATH,
  changePasswordInputSchema,
  userProfileSchema,
  type ChangePasswordInput,
  type UserProfile,
} from '@interscale/shared';
import { ApiClientError, apiRequest, authRequest } from './api';

/**
 * Thin Better Auth client.
 *
 * Deliberately dependency-free: the SPA only needs sign-in, sign-out, the
 * current profile and the forced password change. Account administration is
 * server-side only (see docs/02-authentication.md).
 */

interface SignInResponse {
  readonly user: { readonly id: string; readonly email: string };
}

/** Sign in with email + password. Throws {@link ApiClientError} on failure. */
export async function signIn(email: string, password: string): Promise<void> {
  await authRequest<SignInResponse>(`${AUTH_BASE_PATH}/sign-in/email`, {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

/** End the current session. Best-effort: never blocks the caller. */
export async function signOut(): Promise<void> {
  try {
    await authRequest<unknown>(`${AUTH_BASE_PATH}/sign-out`, { method: 'POST' });
  } catch {
    // The session is invalidated server-side when possible; a failure here
    // must not prevent the client from clearing local state.
  }
}

/** Fetch the sanitized current-user profile, or `null` when unauthenticated. */
export async function fetchCurrentUser(): Promise<UserProfile | null> {
  try {
    const data = await apiRequest<unknown>(`${API_PREFIX}/me`);
    return userProfileSchema.parse(data);
  } catch (error) {
    if (error instanceof ApiClientError && error.status === 401) {
      return null;
    }

    throw error;
  }
}

/** Change the current password (also clears the forced-change flag). */
export async function changePassword(input: ChangePasswordInput): Promise<UserProfile> {
  const payload = changePasswordInputSchema.parse(input);
  const data = await apiRequest<unknown>(`${API_PREFIX}/me/change-password`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });

  return userProfileSchema.parse(data);
}
