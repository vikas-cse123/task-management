import { changePasswordInputSchema } from '@interscale/shared';
import { fromNodeHeaders } from 'better-auth/node';
import { Router } from 'express';
import type { Auth } from '../auth/auth';
import { requireActiveAccount, requireAuth } from '../auth/middleware';
import { toUserProfile, type RawUser } from '../auth/user-projection';
import { asyncHandler } from '../lib/async-handler';
import { unauthorizedError } from '../lib/http';
import type { UserAccountWriter } from '../services/user-account';

/**
 * Current-user endpoints.
 *
 * `/me` is intentionally available while `requiresPasswordChange` is set so the
 * SPA can detect the forced change and route the user to `/change-password`.
 */
export function createMeRouter(auth: Auth, userAccount: UserAccountWriter): Router {
  const router = Router();

  router.get('/', requireAuth(auth), requireActiveAccount(), (req, res) => {
    res.status(200).json({ data: req.auth?.profile });
  });

  router.post(
    '/change-password',
    requireAuth(auth),
    requireActiveAccount(),
    asyncHandler(async (req, res) => {
      const input = changePasswordInputSchema.parse(req.body);
      const headers = fromNodeHeaders(req.headers);

      // `revokeOtherSessions` makes Better Auth rotate the session: it deletes
      // every session and issues a brand-new one. The new cookie only exists on
      // the returned headers, so we must forward it to the client or the
      // browser would keep a token that no longer exists.
      const result = await auth.api.changePassword({
        headers,
        body: {
          currentPassword: input.currentPassword,
          newPassword: input.newPassword,
          revokeOtherSessions: input.revokeOtherSessions,
        },
        returnHeaders: true,
      });

      const rotatedCookies = result.headers.getSetCookie?.() ?? [];

      for (const cookie of rotatedCookies) {
        res.append('set-cookie', cookie);
      }

      const userId = req.auth?.profile.id;

      if (!userId) {
        throw unauthorizedError();
      }

      await userAccount.setPasswordChangeRequired(userId, false);

      const sessionHeaders =
        rotatedCookies.length > 0
          ? new Headers({ cookie: rotatedCookies.map((cookie) => cookie.split(';')[0]).join('; ') })
          : headers;

      const refreshed = await auth.api.getSession({ headers: sessionHeaders });

      res.status(200).json({
        data: refreshed ? toUserProfile(refreshed.user as unknown as RawUser) : req.auth?.profile,
      });
    }),
  );

  return router;
}
