import type {
  ProjectGenerationInput,
  TemplateDraftInput,
  TemplateNodeInput,
} from '@interscale/shared';
import mongoose from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  assignClientRole,
  AuditLogModel,
  ConflictError,
  createClientRecord,
  createTemplateRecord,
  instantiateProjectFromTemplate,
  JobRoleModel,
  NotificationInboxModel,
  previewProjectFromTemplate,
  ProjectGenerationModel,
  ProjectModel,
  publishTemplateVersion,
  seedReferenceData,
  TaskDependencyModel,
  TaskModel,
  ValidationError,
  type EmployeeDirectory,
} from '../src';
import {
  clearTestDatabase,
  connectTestDatabase,
  disconnectTestDatabase,
  ensureIndexes,
} from './support/database';
import { hasTestDatabase } from './support/flags';

const ACTOR = new mongoose.Types.ObjectId().toString();
const MANAGER = new mongoose.Types.ObjectId().toString();
const SCRIPT_WRITER = new mongoose.Types.ObjectId().toString();
const EDITOR = new mongoose.Types.ObjectId().toString();
const MARKETER = new mongoose.Types.ObjectId().toString();

let roleIds: Record<string, string>;

function directory(): EmployeeDirectory {
  const employees: Record<string, string[]> = {
    [MANAGER]: [roleIds.project_manager as string],
    [SCRIPT_WRITER]: [roleIds.video_ad_script_writer as string],
    [EDITOR]: [roleIds.video_editor as string],
    [MARKETER]: [roleIds.performance_marketer as string],
  };

  return {
    async findById(id: string) {
      if (!(id in employees)) {
        return null;
      }

      return { id, status: 'active' as const, jobRoleIds: employees[id] as string[] };
    },
  };
}

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

const campaignDraft: TemplateDraftInput = {
  nodes: [
    node({
      nodeKey: 'brief',
      titleTemplate: 'Campaign Brief',
      requiredJobRoleKey: 'performance_marketer',
    }),
    node({
      nodeKey: 'video',
      titleTemplate: 'Produce {{destination}} Video Ad {{adIndex}}',
      repeatGroup: 'video_ad',
      assignmentRule: 'project_manager',
    }),
    node({
      nodeKey: 'script',
      parentNodeKey: 'video',
      titleTemplate: 'Write {{destination}} Video Script {{adIndex}}',
      repeatGroup: 'video_ad',
      requiredJobRoleKey: 'video_ad_script_writer',
      approvalRequired: true,
      approverResolutionRule: 'project_manager',
    }),
    node({
      nodeKey: 'edit',
      parentNodeKey: 'video',
      titleTemplate: 'Edit {{destination}} Video {{adIndex}}',
      repeatGroup: 'video_ad',
      requiredJobRoleKey: 'video_editor',
      approvalRequired: true,
      approverResolutionRule: 'project_manager',
    }),
    node({
      nodeKey: 'launch',
      titleTemplate: 'Launch {{destination}}',
      requiredJobRoleKey: 'performance_marketer',
    }),
  ],
  dependencies: [
    { predecessorNodeKey: 'brief', successorNodeKey: 'script' },
    { predecessorNodeKey: 'script', successorNodeKey: 'edit' },
    { predecessorNodeKey: 'edit', successorNodeKey: 'launch' },
  ],
};

function generationInput(
  clientId: string,
  templateId: string,
  overrides: Partial<ProjectGenerationInput> = {},
): ProjectGenerationInput {
  return {
    clientId,
    templateId,
    name: 'Singapore Campaign',
    destination: 'Singapore',
    campaignName: null,
    startAt: '2027-03-01T00:00:00.000Z',
    targetAt: '2027-04-01T00:00:00.000Z',
    managerId: MANAGER,
    videoAdCount: 3,
    creativeTypes: ['video'],
    roleOverrides: [],
    deadlineOverrides: [],
    idempotencyKey: 'gen-00000001',
    ...overrides,
  };
}

async function publishCampaignTemplate(key = 'campaign_test'): Promise<string> {
  const template = await createTemplateRecord(
    { key, name: 'Test Campaign', description: null, type: 'campaign', draft: campaignDraft },
    ACTOR,
  );
  await publishTemplateVersion(template.id, {}, ACTOR);
  return template.id;
}

async function createReadyClient(name = 'Acme Travel', withRoles = true): Promise<string> {
  const client = await createClientRecord(
    { name, status: 'active', primaryManagerId: MANAGER },
    ACTOR,
    { directory: directory() },
  );

  if (withRoles) {
    await assignClientRole(
      {
        clientId: client.id,
        jobRoleId: roleIds.project_manager as string,
        userId: MANAGER,
        isPrimary: true,
        actorId: ACTOR,
      },
      { directory: directory() },
    );
    await assignClientRole(
      {
        clientId: client.id,
        jobRoleId: roleIds.video_ad_script_writer as string,
        userId: SCRIPT_WRITER,
        isPrimary: true,
        actorId: ACTOR,
      },
      { directory: directory() },
    );
    await assignClientRole(
      {
        clientId: client.id,
        jobRoleId: roleIds.video_editor as string,
        userId: EDITOR,
        isPrimary: true,
        actorId: ACTOR,
      },
      { directory: directory() },
    );
    await assignClientRole(
      {
        clientId: client.id,
        jobRoleId: roleIds.performance_marketer as string,
        userId: MARKETER,
        isPrimary: true,
        actorId: ACTOR,
      },
      { directory: directory() },
    );
  }

  return client.id;
}

describe.skipIf(!hasTestDatabase)('project generation from template', () => {
  beforeAll(async () => {
    await connectTestDatabase('template_instantiation');
    await ensureIndexes();
  });

  beforeEach(async () => {
    await clearTestDatabase();
    // Reference data is cleared with the rest of the database; re-seed it and
    // re-read the freshly generated job-role ids.
    await seedReferenceData();
    const roles = await JobRoleModel.find().lean();
    roleIds = Object.fromEntries(roles.map((role) => [role.key, role._id.toString()]));
  });

  afterAll(async () => {
    await disconnectTestDatabase();
  });

  it('previews the exact tasks, assignments and statuses without writing', async () => {
    const clientId = await createReadyClient();
    const templateId = await publishCampaignTemplate();

    const preview = await previewProjectFromTemplate(generationInput(clientId, templateId), {
      directory: directory(),
    });

    expect(preview.tasks).toHaveLength(11);
    expect(preview.warnings).toEqual([]);

    const brief = preview.tasks.find((entry) => entry.nodeKey === 'brief');
    expect(brief?.assignedUserId).toBe(MARKETER);
    expect(brief?.initialStatus).toBe('todo');

    const video = preview.tasks.find((entry) => entry.nodeKey === 'video__2');
    expect(video?.title).toBe('Produce Singapore Video Ad 2');
    expect(video?.assignedUserId).toBe(MANAGER);

    const script = preview.tasks.find((entry) => entry.nodeKey === 'script__1');
    expect(script?.initialStatus).toBe('blocked');
    expect(script?.assignedUserId).toBe(SCRIPT_WRITER);
    expect(script?.approverId).toBe(MANAGER);

    const launch = preview.tasks.find((entry) => entry.nodeKey === 'launch');
    expect(launch?.initialStatus).toBe('blocked');

    expect(await ProjectModel.countDocuments()).toBe(0);
  });

  it('creates the project graph atomically and records the generation', async () => {
    const clientId = await createReadyClient();
    const templateId = await publishCampaignTemplate();

    const result = await instantiateProjectFromTemplate(
      generationInput(clientId, templateId),
      ACTOR,
      { directory: directory() },
    );

    expect(result.idempotentReplay).toBe(false);
    expect(result.taskCount).toBe(5);
    expect(result.subtaskCount).toBe(6);
    expect(result.dependencyCount).toBe(9);

    const project = await ProjectModel.findById(result.project.id).lean();
    expect(project?.status).toBe('planned');
    expect(project?.templateId?.toString()).toBe(templateId);
    expect(project?.templateVersion).toBe(1);
    expect(project?.dependencyVersion).toBe(9);

    expect(await TaskModel.countDocuments({ parentTaskId: null })).toBe(5);
    expect(await TaskModel.countDocuments({ parentTaskId: { $ne: null } })).toBe(6);
    expect(await TaskDependencyModel.countDocuments()).toBe(9);

    const blockedLaunch = await TaskModel.findOne({ title: 'Launch Singapore' }).lean();
    expect(blockedLaunch?.status).toBe('blocked');

    const record = await ProjectGenerationModel.findOne({ idempotencyKey: 'gen-00000001' }).lean();
    expect(record?.projectId.toString()).toBe(result.project.id);

    const audit = await AuditLogModel.findOne({ action: 'project.generate' }).lean();
    expect(audit?.entityId.toString()).toBe(result.project.id);
  });

  it('queues an assignment notification for every assigned generated task', async () => {
    const clientId = await createReadyClient();
    const templateId = await publishCampaignTemplate('campaign_notify');

    await instantiateProjectFromTemplate(generationInput(clientId, templateId), ACTOR, {
      directory: directory(),
    });

    const inbox = await NotificationInboxModel.find().lean();
    const assignedTasks = await TaskModel.countDocuments({ assignedUserId: { $ne: null } });

    expect(inbox).toHaveLength(assignedTasks);
    expect(inbox.every((entry) => entry.eventType === 'task.assigned')).toBe(true);
    expect(new Set(inbox.map((entry) => entry.recipientUserId.toString()))).toEqual(
      new Set([MARKETER, SCRIPT_WRITER, EDITOR, MANAGER]),
    );
  });

  it('replays the same idempotency key without duplicating the project', async () => {
    const clientId = await createReadyClient();
    const templateId = await publishCampaignTemplate();

    const first = await instantiateProjectFromTemplate(
      generationInput(clientId, templateId),
      ACTOR,
      { directory: directory() },
    );
    const second = await instantiateProjectFromTemplate(
      generationInput(clientId, templateId),
      ACTOR,
      { directory: directory() },
    );

    expect(second.idempotentReplay).toBe(true);
    expect(second.project.id).toBe(first.project.id);
    expect(await ProjectModel.countDocuments()).toBe(1);
    expect(await TaskModel.countDocuments()).toBe(11);
  });

  it('conflicts when the key is reused with different input', async () => {
    const clientId = await createReadyClient();
    const templateId = await publishCampaignTemplate();

    await instantiateProjectFromTemplate(generationInput(clientId, templateId), ACTOR, {
      directory: directory(),
    });

    await expect(
      instantiateProjectFromTemplate(
        generationInput(clientId, templateId, { name: 'Different Name' }),
        ACTOR,
        { directory: directory() },
      ),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('surfaces warnings instead of inventing assignments', async () => {
    const clientId = await createReadyClient('Empty Roles', false);
    const templateId = await publishCampaignTemplate('campaign_warn');

    const preview = await previewProjectFromTemplate(
      generationInput(clientId, templateId, { managerId: null }),
      { directory: directory() },
    );

    const codes = preview.warnings.map((entry) => entry.code);
    expect(codes).toContain('needs_assignment');
    expect(codes).toContain('needs_approver');
  });

  it('validates campaign inputs before writing', async () => {
    const clientId = await createReadyClient();
    const templateId = await publishCampaignTemplate('campaign_validate');

    await expect(
      previewProjectFromTemplate(generationInput(clientId, templateId, { destination: null }), {
        directory: directory(),
      }),
    ).rejects.toBeInstanceOf(ValidationError);

    await expect(
      previewProjectFromTemplate(
        generationInput(clientId, templateId, { creativeTypes: ['static'] }),
        {
          directory: directory(),
        },
      ),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});
