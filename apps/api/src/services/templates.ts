import {
  archiveTemplateRecord,
  createTemplateRecord,
  ensureDraftVersion,
  findTemplateDetail,
  getTemplateVersion,
  listTemplates as dbListTemplates,
  publishTemplateVersion,
  replaceDraftContent,
  updateTemplateRecord,
  validateTemplateVersion,
  type EmployeeDirectory,
} from '@interscale/db';
import type {
  ArchiveTemplateInput,
  CreateTemplateInput,
  PublishTemplateInput,
  TemplateDetail,
  TemplateDraftInput,
  TemplateListQuery,
  TemplateSummary,
  TemplateValidationResult,
  TemplateVersionDetail,
  UpdateTemplateInput,
  UserProfile,
} from '@interscale/shared';
import { forbiddenError } from '../lib/http';

/**
 * Template administration (Phase 4, Step 22).
 *
 * Managing templates is an Admin-only base permission. Managers may only read
 * *published* templates (and their published versions) so they can create
 * projects from them; drafts and archived templates are invisible to them.
 */

export interface TemplatePage {
  readonly data: TemplateSummary[];
  readonly nextCursor: string | null;
}

export interface TemplateService {
  listTemplates(actor: UserProfile, query: TemplateListQuery): Promise<TemplatePage>;
  getTemplate(actor: UserProfile, id: string): Promise<TemplateDetail | null>;
  getTemplateVersion(
    actor: UserProfile,
    id: string,
    version: number,
  ): Promise<TemplateVersionDetail | null>;
  createTemplate(actor: UserProfile, input: CreateTemplateInput): Promise<TemplateSummary>;
  updateTemplate(
    actor: UserProfile,
    id: string,
    input: UpdateTemplateInput,
  ): Promise<TemplateSummary>;
  replaceDraft(
    actor: UserProfile,
    id: string,
    draft: TemplateDraftInput,
  ): Promise<TemplateVersionDetail>;
  ensureDraft(actor: UserProfile, id: string): Promise<TemplateVersionDetail>;
  validateVersion(
    actor: UserProfile,
    id: string,
    version?: number,
  ): Promise<{ version: number; result: TemplateValidationResult }>;
  publishTemplate(
    actor: UserProfile,
    id: string,
    input: PublishTemplateInput,
  ): Promise<TemplateSummary>;
  archiveTemplate(
    actor: UserProfile,
    id: string,
    input: ArchiveTemplateInput,
  ): Promise<TemplateSummary>;
}

function isAdmin(actor: UserProfile): boolean {
  return actor.accessLevel === 'Admin';
}

function requireAdminActor(actor: UserProfile): void {
  if (!isAdmin(actor)) {
    throw forbiddenError('Managing templates requires an Admin account');
  }
}

export function createTemplateService(_directory?: EmployeeDirectory): TemplateService {
  void _directory;

  return {
    async listTemplates(actor, query) {
      const scoped: TemplateListQuery = isAdmin(actor) ? query : { ...query, status: 'published' };

      const page = await dbListTemplates(scoped);
      return { data: page.data, nextCursor: page.nextCursor };
    },

    async getTemplate(actor, id) {
      const detail = await findTemplateDetail(id);

      if (!detail) {
        return null;
      }

      if (!isAdmin(actor) && detail.status !== 'published') {
        return null;
      }

      return detail;
    },

    async getTemplateVersion(actor, id, version) {
      const detail = await getTemplateVersion(id, version);

      if (!detail) {
        return null;
      }

      if (!isAdmin(actor) && detail.status !== 'published') {
        return null;
      }

      return detail;
    },

    async createTemplate(actor, input) {
      requireAdminActor(actor);
      return createTemplateRecord(input, actor.id);
    },

    async updateTemplate(actor, id, input) {
      requireAdminActor(actor);
      return updateTemplateRecord(id, input, actor.id);
    },

    async replaceDraft(actor, id, draft) {
      requireAdminActor(actor);
      return replaceDraftContent(id, draft, actor.id);
    },

    async ensureDraft(actor, id) {
      requireAdminActor(actor);
      return ensureDraftVersion(id, actor.id);
    },

    async validateVersion(actor, id, version) {
      requireAdminActor(actor);
      return validateTemplateVersion(id, version);
    },

    async publishTemplate(actor, id, input) {
      requireAdminActor(actor);
      return publishTemplateVersion(id, input, actor.id);
    },

    async archiveTemplate(actor, id, input) {
      requireAdminActor(actor);
      return archiveTemplateRecord(id, input.reason, actor.id);
    },
  };
}
