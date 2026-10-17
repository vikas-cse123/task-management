import type { TemplateDraftInput, TemplateNodeInput } from '@interscale/shared';
import mongoose from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  archiveTemplateRecord,
  AuditLogModel,
  ConflictError,
  createTemplateRecord,
  ensureDraftVersion,
  findTemplate,
  findTemplateDetail,
  getTemplateVersion,
  listTemplateVersions,
  listTemplates,
  publishTemplateVersion,
  replaceDraftContent,
  TemplateVersionModel,
  ValidationError,
  validateTemplateVersion,
} from '../src';
import {
  clearTestDatabase,
  connectTestDatabase,
  disconnectTestDatabase,
  ensureIndexes,
} from './support/database';
import { hasTestDatabase } from './support/flags';

const ACTOR = new mongoose.Types.ObjectId().toString();

function node(
  partial: Partial<TemplateNodeInput> & Pick<TemplateNodeInput, 'nodeKey' | 'titleTemplate'>,
): TemplateNodeInput {
  return {
    nodeKey: partial.nodeKey,
    parentNodeKey: partial.parentNodeKey ?? null,
    titleTemplate: partial.titleTemplate,
    descriptionTemplate: partial.descriptionTemplate ?? null,
    requiredJobRoleKey: partial.requiredJobRoleKey ?? null,
    priority: partial.priority ?? 'medium',
    approvalRequired: partial.approvalRequired ?? false,
    approverResolutionRule: partial.approverResolutionRule ?? 'none',
    assignmentRule: partial.assignmentRule ?? 'designated',
    relativeDueRule: partial.relativeDueRule ?? null,
    isRequired: partial.isRequired ?? true,
    repeatGroup: partial.repeatGroup ?? null,
    sopUrl: partial.sopUrl ?? null,
    referenceUrl: partial.referenceUrl ?? null,
    sortOrder: partial.sortOrder ?? 0,
  };
}

function draft(overrides: Partial<TemplateDraftInput> = {}): TemplateDraftInput {
  return {
    nodes: [
      node({ nodeKey: 'brief', titleTemplate: 'Campaign Brief' }),
      node({ nodeKey: 'launch', titleTemplate: 'Launch {{destination}}' }),
    ],
    dependencies: [{ predecessorNodeKey: 'brief', successorNodeKey: 'launch' }],
    ...overrides,
  };
}

describe.skipIf(!hasTestDatabase)('template service', () => {
  beforeAll(async () => {
    await connectTestDatabase('template_service');
    await ensureIndexes();
  });

  beforeEach(async () => {
    await clearTestDatabase();
  });

  afterAll(async () => {
    await disconnectTestDatabase();
  });

  it('creates a template with an empty draft version and audits it', async () => {
    const template = await createTemplateRecord(
      { key: 'campaign_alpha', name: 'Campaign Alpha', description: null, type: 'campaign' },
      ACTOR,
    );

    expect(template.status).toBe('draft');
    expect(template.currentPublishedVersion).toBeNull();
    expect(template.taskDefinitionCount).toBe(0);

    const detail = await findTemplateDetail(template.id);
    expect(detail?.versions).toHaveLength(1);
    expect(detail?.versions[0]?.version).toBe(1);
    expect(detail?.draftVersion).toBe(1);

    const audit = await AuditLogModel.findOne({ action: 'template.create' }).lean();
    expect(audit?.entityId.toString()).toBe(template.id);
  });

  it('rejects an invalid draft and duplicate keys', async () => {
    await expect(
      createTemplateRecord(
        {
          key: 'campaign_bad',
          name: 'Bad',
          description: null,
          type: 'campaign',
          draft: draft({
            nodes: [node({ nodeKey: 'x', titleTemplate: 'Ad {{adIndex}}' })],
            dependencies: [],
          }),
        },
        ACTOR,
      ),
    ).rejects.toBeInstanceOf(ValidationError);

    await createTemplateRecord(
      { key: 'campaign_dup', name: 'First', description: null, type: 'campaign' },
      ACTOR,
    );

    await expect(
      createTemplateRecord(
        { key: 'campaign_dup', name: 'Second', description: null, type: 'campaign' },
        ACTOR,
      ),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('publishes a draft, archives history and opens the next draft', async () => {
    const template = await createTemplateRecord(
      {
        key: 'campaign_bravo',
        name: 'Campaign Bravo',
        description: null,
        type: 'campaign',
        draft: draft(),
      },
      ACTOR,
    );

    const validation = await validateTemplateVersion(template.id, undefined);
    expect(validation.result.valid).toBe(true);

    const published = await publishTemplateVersion(template.id, { notes: 'v1' }, ACTOR);
    expect(published.status).toBe('published');
    expect(published.currentPublishedVersion).toBe(1);
    expect(published.taskDefinitionCount).toBe(2);

    const versions = await listTemplateVersions(template.id);
    expect(versions.map((entry) => [entry.version, entry.status])).toEqual([
      [2, 'draft'],
      [1, 'published'],
    ]);

    const detail = await findTemplateDetail(template.id);
    expect(detail?.draftVersion).toBe(2);
    expect(detail?.draftNodeCount).toBe(0);

    const audit = await AuditLogModel.findOne({ action: 'template.publish' }).lean();
    expect(audit?.entityId.toString()).toBe(template.id);
  });

  it('keeps published versions immutable when the draft changes', async () => {
    const template = await createTemplateRecord(
      {
        key: 'campaign_charlie',
        name: 'Campaign Charlie',
        description: null,
        type: 'campaign',
        draft: draft(),
      },
      ACTOR,
    );

    await publishTemplateVersion(template.id, {}, ACTOR);

    await replaceDraftContent(
      template.id,
      draft({
        nodes: [
          node({ nodeKey: 'brief', titleTemplate: 'Brief v2' }),
          node({ nodeKey: 'launch', titleTemplate: 'Launch {{destination}} v2' }),
        ],
      }),
      ACTOR,
    );

    const original = await getTemplateVersion(template.id, 1);
    expect(original?.nodes.map((entry) => entry.titleTemplate)).toEqual([
      'Campaign Brief',
      'Launch {{destination}}',
    ]);

    const next = await getTemplateVersion(template.id, 2);
    expect(next?.nodes.map((entry) => entry.titleTemplate)).toContain('Brief v2');
  });

  it('rejects publishing an invalid version', async () => {
    const template = await createTemplateRecord(
      { key: 'campaign_delta', name: 'Campaign Delta', description: null, type: 'campaign' },
      ACTOR,
    );

    await expect(publishTemplateVersion(template.id, {}, ACTOR)).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it('clones the published version into a fresh draft when none exists', async () => {
    const template = await createTemplateRecord(
      {
        key: 'campaign_echo',
        name: 'Campaign Echo',
        description: null,
        type: 'campaign',
        draft: draft(),
      },
      ACTOR,
    );

    await publishTemplateVersion(template.id, {}, ACTOR);
    await TemplateVersionModel.deleteOne({ templateId: template.id, status: 'draft' });

    const draftVersion = await ensureDraftVersion(template.id, ACTOR);
    expect(draftVersion.status).toBe('draft');
    expect(draftVersion.nodes.map((entry) => entry.nodeKey)).toEqual(['launch', 'brief'].sort());
    expect(draftVersion.nodes).toHaveLength(2);
  });

  it('archives a template and blocks further edits', async () => {
    const template = await createTemplateRecord(
      {
        key: 'campaign_foxtrot',
        name: 'Campaign Foxtrot',
        description: null,
        type: 'campaign',
        draft: draft(),
      },
      ACTOR,
    );

    await publishTemplateVersion(template.id, {}, ACTOR);
    const archived = await archiveTemplateRecord(template.id, 'Retired', ACTOR);
    expect(archived.status).toBe('archived');

    await expect(replaceDraftContent(template.id, draft(), ACTOR)).rejects.toBeInstanceOf(
      ValidationError,
    );
    await expect(publishTemplateVersion(template.id, {}, ACTOR)).rejects.toBeInstanceOf(
      ValidationError,
    );

    const summaries = await listTemplates({ limit: 10, status: 'archived' });
    expect(summaries.data.map((entry) => entry.id)).toContain(template.id);
  });

  it('scopes listing by status and search', async () => {
    await createTemplateRecord(
      { key: 'onboarding_one', name: 'Onboarding One', description: null, type: 'onboarding' },
      ACTOR,
    );
    await createTemplateRecord(
      { key: 'campaign_one', name: 'Campaign One', description: null, type: 'campaign' },
      ACTOR,
    );

    const campaigns = await listTemplates({ limit: 10, type: 'campaign' });
    expect(campaigns.data.map((entry) => entry.name)).toEqual(['Campaign One']);

    const search = await listTemplates({ limit: 10, search: 'onboarding' });
    expect(search.data.map((entry) => entry.name)).toEqual(['Onboarding One']);

    expect(await findTemplate(new mongoose.Types.ObjectId().toString())).toBeNull();
  });
});
