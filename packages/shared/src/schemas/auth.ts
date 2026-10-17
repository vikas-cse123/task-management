import { z } from 'zod';
import { emailSchema } from './primitives';

/**
 * Password policy shared by the API and the frontend.
 *
 * Kept in sync with the Better Auth `emailAndPassword.minPasswordLength` /
 * `maxPasswordLength` configuration in `apps/api`. Hashes are never exposed to
 * the frontend; these rules only describe what may be submitted.
 */
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Password must be at least ${PASSWORD_MIN_LENGTH} characters`)
  .max(PASSWORD_MAX_LENGTH, `Password must be at most ${PASSWORD_MAX_LENGTH} characters`);

/** Login submission (email + password only; there is no signup). */
export const loginInputSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required').max(PASSWORD_MAX_LENGTH),
});

export type LoginInput = z.infer<typeof loginInputSchema>;

/**
 * Change-password submission.
 *
 * Used both by the forced first-login change and by a voluntary change. Other
 * sessions are revoked by default so a compromised session cannot survive a
 * password change.
 */
export const changePasswordInputSchema = z
  .object({
    currentPassword: z.string().min(1, 'Current password is required').max(PASSWORD_MAX_LENGTH),
    newPassword: passwordSchema,
    revokeOtherSessions: z.boolean().default(true),
  })
  .refine((value) => value.currentPassword !== value.newPassword, {
    message: 'The new password must be different from the current password',
    path: ['newPassword'],
  });

export type ChangePasswordInput = z.infer<typeof changePasswordInputSchema>;
