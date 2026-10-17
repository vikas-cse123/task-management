import {
  projectGenerationInputSchema,
  projectGenerationPreviewInputSchema,
  type UserProfile,
} from '@interscale/shared';
import { Router } from 'express';
import type { Auth } from '../auth/auth';
import { requireActiveSession } from '../auth/middleware';
import { asyncHandler } from '../lib/async-handler';
import { unauthorizedError } from '../lib/http';
import type { GenerationService } from '../services/generation';

/**
 * Project generation from a published template (Phase 4, Step 22).
 *
 * Mounted under `/projects` before the project router so `/from-template*`
 * is not captured by `/projects/:id`. Capability + client scope are enforced
 * by the service.
 */
export function createGenerationRouter(auth: Auth, service: GenerationService): Router {
  const router = Router();
  const session = requireActiveSession(auth);

  function actor(req: { auth?: { profile: UserProfile } }): UserProfile {
    const profile = req.auth?.profile;

    if (!profile) {
      throw unauthorizedError();
    }

    return profile;
  }

  router.post(
    '/from-template/preview',
    ...session,
    asyncHandler(async (req, res) => {
      const input = projectGenerationPreviewInputSchema.parse(req.body);
      const preview = await service.preview(actor(req), input);

      res.status(200).json({ data: preview });
    }),
  );

  router.post(
    '/from-template',
    ...session,
    asyncHandler(async (req, res) => {
      const input = projectGenerationInputSchema.parse(req.body);
      const result = await service.create(actor(req), input);

      res.status(201).json({ data: result });
    }),
  );

  return router;
}
