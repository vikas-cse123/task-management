import {
  instantiateProjectFromTemplate,
  isActiveClientMember,
  MongoEmployeeDirectory,
  previewProjectFromTemplate,
  type EmployeeDirectory,
} from '@interscale/db';
import { NotFoundError } from '@interscale/db';
import {
  hasCapability,
  type ProjectGenerationInput,
  type ProjectGenerationPreview,
  type ProjectGenerationPreviewInput,
  type ProjectGenerationResult,
  type UserProfile,
} from '@interscale/shared';
import { forbiddenError } from '../lib/http';

/**
 * One-click project generation from a published template (Phase 4, Step 22).
 *
 * Requires the `projects.create_from_template` capability. Admins implicitly
 * hold it; a Manager must be granted it explicitly. Managers may only generate
 * projects for clients they are an active member of (Admins may use any client),
 * and out-of-scope access returns 404 to prevent IDOR probing.
 */

export interface GenerationService {
  preview(
    actor: UserProfile,
    input: ProjectGenerationPreviewInput,
  ): Promise<ProjectGenerationPreview>;
  create(actor: UserProfile, input: ProjectGenerationInput): Promise<ProjectGenerationResult>;
}

function assertMayGenerate(actor: UserProfile): void {
  if (!hasCapability(actor.accessLevel, actor.capabilities, 'projects.create_from_template')) {
    throw forbiddenError(
      'Creating projects from a template requires the projects.create_from_template capability',
    );
  }
}

export function createGenerationService(
  directory: EmployeeDirectory = new MongoEmployeeDirectory(),
): GenerationService {
  const deps = { directory };

  async function assertClientInScope(actor: UserProfile, clientId: string): Promise<void> {
    if (actor.accessLevel === 'Admin') {
      return;
    }

    const inScope = await isActiveClientMember(clientId, actor.id);

    if (!inScope) {
      throw new NotFoundError('Client');
    }
  }

  return {
    async preview(actor, input) {
      assertMayGenerate(actor);
      await assertClientInScope(actor, input.clientId);
      return previewProjectFromTemplate(input, deps);
    },

    async create(actor, input) {
      assertMayGenerate(actor);
      await assertClientInScope(actor, input.clientId);
      return instantiateProjectFromTemplate(input, actor.id, deps);
    },
  };
}
