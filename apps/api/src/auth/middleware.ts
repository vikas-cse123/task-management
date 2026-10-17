import {
  hasCapability,
  type AccessLevel,
  type Capability,
  type UserProfile,
} from '@interscale/shared';
import { fromNodeHeaders } from 'better-auth/node';
import type { NextFunction, Request, Response } from 'express';
import { forbiddenError, unauthorizedError } from '../lib/http';
import type { Auth } from './auth';
import { toUserProfile, type RawUser } from './user-projection';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthenticatedRequest;
    }
  }
}

export interface AuthenticatedRequest {
  readonly profile: UserProfile;
  readonly sessionId: string;
}

export type Middleware = (req: Request, res: Response, next: NextFunction) => void;

/**
 * Resolve the Better Auth session and attach the sanitized profile.
 *
 * Rejects with `401 UNAUTHENTICATED` when there is no valid session. Runs a
 * server-side session lookup on every protected request (no cookie cache), so
 * deactivation and revocation take effect immediately.
 */
export function requireAuth(auth: Auth): Middleware {
  return (req, _res, next) => {
    void (async () => {
      try {
        const result = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });

        if (!result) {
          next(unauthorizedError());
          return;
        }

        req.auth = {
          profile: toUserProfile(result.user as unknown as RawUser),
          sessionId: result.session.id,
        };

        next();
      } catch (error) {
        next(error);
      }
    })();
  };
}

/** Reject requests from accounts that are not `active`. */
export function requireActiveAccount(): Middleware {
  return (req, _res, next) => {
    if (!req.auth) {
      next(unauthorizedError());
      return;
    }

    if (req.auth.profile.status !== 'active') {
      next(forbiddenError('This account is inactive'));
      return;
    }

    next();
  };
}

/**
 * Reject requests from users who must still change their temporary password.
 *
 * The force-change endpoints (`GET /me`, change-password) deliberately omit this
 * guard so the user can complete the change.
 */
export function requirePasswordChanged(): Middleware {
  return (req, _res, next) => {
    if (!req.auth) {
      next(unauthorizedError());
      return;
    }

    if (req.auth.profile.requiresPasswordChange) {
      next(forbiddenError('You must change your password before continuing'));
      return;
    }

    next();
  };
}

/** Require the Admin application access level. */
export function requireAdmin(): Middleware {
  return requireAccessLevel('Admin');
}

/** Require one of the given application access levels. */
export function requireAccessLevel(...levels: AccessLevel[]): Middleware {
  return (req, _res, next) => {
    if (!req.auth) {
      next(unauthorizedError());
      return;
    }

    if (!levels.includes(req.auth.profile.accessLevel)) {
      next(forbiddenError());
      return;
    }

    next();
  };
}

/** Require a capability (Admins implicitly hold every capability). */
export function requireCapability(capability: Capability): Middleware {
  return (req, _res, next) => {
    if (!req.auth) {
      next(unauthorizedError());
      return;
    }

    const { accessLevel, capabilities } = req.auth.profile;

    if (!hasCapability(accessLevel, capabilities, capability)) {
      next(forbiddenError());
      return;
    }

    next();
  };
}

/**
 * Standard authenticated guard: valid session + active account + password
 * already changed. Use for every protected endpoint except the force-change
 * flow itself.
 */
export function requireActiveSession(auth: Auth): Middleware[] {
  return [requireAuth(auth), requireActiveAccount(), requirePasswordChanged()];
}
