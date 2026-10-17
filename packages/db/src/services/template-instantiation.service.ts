import {
  DEFAULT_REVIEW_INTERVAL_DAYS,
  TEMPLATE_TYPE_TO_PROJECT_TYPE,
  type AssignmentSource,
  type CreativeType,
  type GeneratedNodePreview,
  type JobRoleKey,
  type ProjectGenerationInput,
  type ProjectGenerationPreview,
  type ProjectGenerationPreviewInput,
  type ProjectGenerationResult,
  type ProjectType,
  type TemplateType,
  type TemplateWarning,
} from '@interscale/shared';
import { createHash } from 'node:crypto';
import mongoose from 'mongoose';
import type { ClientSession, Connection } from 'mongoose';
import { getConnection, withTransaction } from '../connection';
import { assertObjectId } from '../lib/object-id';
import { ConflictError, NotFoundError, ValidationError } from '../lib/errors';
import { ClientModel } from '../models/client';
import { ClientRoleAssignmentModel } from '../models/client-role-assignment';
import { JobRoleModel } from '../models/job-role';
import { ProjectGenerationModel } from '../models/project-generation';
import { ProjectModel } from '../models/project';
import { TaskDependencyModel } from '../models/task-dependency';
import { TaskModel } from '../models/task';
import { TemplateVersionModel } from '../models/template-version';
import { TemplateModel } from '../models/template';
import { recordAudit } from './audit.service';
import { ensureCampaignReviewSchedule } from './campaign-review.service';
import { ensureActiveMembership, isActiveClientMember } from './client.service';
import { resolveAssignableEmployee, type EmployeeDirectory } from './employee-directory';
import { findProject } from './project.service';
import { notifyTaskAssignment } from './task-notifications.service';
import {
  expandTemplateDefinition,
  type ExpandedDependency,
  type ExpandedNode,
} from './template-expansion';
import { loadTemplateDefinition } from './template.service';
import { validateTemplateDefinition } from './template-validation';

/**
 * Atomic, idempotent project generation from a published template
 * (Phase 4, Step 22).
 *
 * The deterministic expansion (variables, repeated creatives, deadlines,
 * initial statuses) is computed and validated BEFORE any write. All writes then
 * happen in one replica-set transaction, together with the durable idempotency
 * record, so a failure can never leave a partial project graph and a retried
 * request can never create a duplicate project.
 */

export interface GenerationServiceDeps {
  directory: EmployeeDirectory;
  connection?: Connection;
}

interface ResolvedNode extends ExpandedNode {
  jobRoleId: string | null;
  assignedUserId: string | null;
  assignmentSource: AssignmentSource | null;
  approverId: string | null;
}

interface GenerationPlan {
  clientId: string;
  clientName: string;
  templateId: string;
  templateKey: string;
  templateName: string;
  templateVersion: number;
  templateType: TemplateType;
  projectType: ProjectType;
  definitionNodes: number;
  nodes: ResolvedNode[];
  dependencies: ExpandedDependency[];
  warnings: TemplateWarning[];
  name: string;
  description: string | null;
  destination: string | null;
  startAt: Date;
  targetAt: Date | null;
  managerId: string | null;
  videoAdCount: number;
  creativeTypes: CreativeType[];
  templateVersionId: string;
}

function resolveConnection(deps: GenerationServiceDeps): Connection {
  return deps.connection ?? getConnection();
}

function parseDate(value: string, label: string): Date {
  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    throw new ValidationError(`A valid ${label} is required`);
  }

  return parsed;
}

function dedupeWarnings(warnings: TemplateWarning[]): TemplateWarning[] {
  const seen = new Set<string>();
  const result: TemplateWarning[] = [];

  for (const warning of warnings) {
    const key = `${warning.code}|${warning.nodeKey ?? ''}|${warning.message}`;

    if (!seen.has(key)) {
      seen.add(key);
      result.push(warning);
    }
  }

  return result;
}

async function resolveJobRoleIds(keys: JobRoleKey[]): Promise<Map<string, string>> {
  if (keys.length === 0) {
    return new Map();
  }

  const roles = await JobRoleModel.find({ key: { $in: keys } })
    .select({ _id: 1, key: 1 })
    .lean();

  const map = new Map(roles.map((role) => [role.key, role._id.toString()]));

  for (const key of keys) {
    if (!map.has(key)) {
      throw new ValidationError(`The functional job role "${key}" is not seeded`);
    }
  }

  return map;
}

/**
 * Build the full, deterministic generation plan. Read-only: safe to run for a
 * preview or immediately before the transactional writes.
 */
async function buildGenerationPlan(
  input: ProjectGenerationPreviewInput | ProjectGenerationInput,
  deps: GenerationServiceDeps,
): Promise<GenerationPlan> {
  void resolveConnection(deps);

  const clientId = assertObjectId(input.clientId, 'client');
  const client = await ClientModel.findById(clientId).lean();

  if (!client) {
    throw new NotFoundError('Client');
  }

  if (client.status !== 'active') {
    throw new ValidationError('The selected client is not active');
  }

  const templateId = assertObjectId(input.templateId, 'template');
  const template = await TemplateModel.findById(templateId).lean();

  if (!template) {
    throw new NotFoundError('Template');
  }

  if (template.status === 'archived') {
    throw new ValidationError('This template is archived and cannot be used');
  }

  const versionNumber = input.templateVersion ?? template.currentPublishedVersion;

  if (versionNumber === null || versionNumber === undefined) {
    throw new ValidationError('This template has no published version yet');
  }

  const version = await TemplateVersionModel.findOne({
    templateId: new mongoose.Types.ObjectId(templateId),
    version: versionNumber,
  }).lean();

  if (!version || version.status !== 'published') {
    throw new ValidationError('The selected template version is not published');
  }

  const definition = await loadTemplateDefinition(version._id.toString());

  const validationIssues = validateTemplateDefinition(definition, {
    name: template.name,
    type: template.type,
  });

  if (validationIssues.length > 0) {
    throw new ValidationError(
      `The template version is invalid: ${validationIssues.map((entry) => entry.message).join('; ')}`,
    );
  }

  const destination = input.destination ?? null;

  if (template.type === 'campaign' && (destination === null || destination.trim().length === 0)) {
    throw new ValidationError('A destination is required for a campaign template');
  }

  const startAt = parseDate(input.startAt, 'start date');
  const targetAt = input.targetAt ? parseDate(input.targetAt, 'target date') : null;

  if (targetAt && targetAt.getTime() < startAt.getTime()) {
    throw new ValidationError('The target date cannot be earlier than the start date');
  }

  const creativeTypes: CreativeType[] = [...input.creativeTypes];

  if (template.type === 'campaign' && !creativeTypes.includes('video')) {
    throw new ValidationError('A campaign template requires the video creative option');
  }

  const expansion = expandTemplateDefinition(definition, {
    clientName: client.name,
    destination,
    campaignName: input.campaignName ?? null,
    projectName: input.name,
    projectStartDate: startAt,
    projectTargetDate: targetAt,
    videoAdCount: input.videoAdCount,
    creativeTypes,
    deadlineOverrides: input.deadlineOverrides,
  });

  const warnings: TemplateWarning[] = [...expansion.warnings];
  const roleKeys = [
    ...new Set(
      expansion.nodes
        .map((node) => node.requiredJobRoleKey)
        .filter((key): key is JobRoleKey => key !== null),
    ),
  ];
  const roleMap = await resolveJobRoleIds(roleKeys);

  const overrides = new Map(input.roleOverrides.map((entry) => [entry.jobRoleKey, entry.userId]));

  // Validate the project manager once (active employee; membership asserted on create).
  const managerId = input.managerId;

  if (managerId) {
    const manager = await deps.directory.findById(managerId);

    if (!manager) {
      throw new NotFoundError('Employee');
    }

    if (manager.status !== 'active') {
      throw new ValidationError('The selected Project Manager is not active');
    }
  }

  const nodes: ResolvedNode[] = [];

  for (const node of expansion.nodes) {
    const jobRoleId = node.requiredJobRoleKey
      ? (roleMap.get(node.requiredJobRoleKey) ?? null)
      : null;

    let assignedUserId: string | null = null;
    let assignmentSource: AssignmentSource | null = null;

    if (node.assignmentRule === 'none') {
      assignedUserId = null;
    } else if (node.assignmentRule === 'project_manager') {
      if (managerId) {
        await assertEligibleMemberForManager(deps, clientId, managerId);
        assignedUserId = managerId;
        assignmentSource = 'template_override';
      } else {
        warnings.push({
          code: 'needs_assignment',
          message: `"${node.title}" needs an assigned Project Manager`,
          nodeKey: node.resolvedKey,
        });
      }
    } else {
      const override = node.requiredJobRoleKey ? overrides.get(node.requiredJobRoleKey) : undefined;

      if (override) {
        await assertValidOverride(deps, clientId, override, jobRoleId, node);
        assignedUserId = override;
        assignmentSource = 'template_override';
      } else if (jobRoleId) {
        const designated = await ClientRoleAssignmentModel.findOne({
          clientId: new mongoose.Types.ObjectId(clientId),
          jobRoleId: new mongoose.Types.ObjectId(jobRoleId),
          isPrimary: true,
          isActive: true,
        })
          .select({ userId: 1 })
          .lean();

        if (designated) {
          const eligible = await isEligible(
            deps,
            clientId,
            designated.userId.toString(),
            jobRoleId,
          );

          if (eligible) {
            assignedUserId = designated.userId.toString();
            assignmentSource = 'role_mapping';
          } else {
            warnings.push({
              code: 'needs_assignment',
              message: `The designated employee for "${node.title}" is no longer eligible`,
              nodeKey: node.resolvedKey,
            });
          }
        } else {
          warnings.push({
            code: 'needs_assignment',
            message: `"${node.title}" has no designated employee for this client`,
            nodeKey: node.resolvedKey,
          });
        }
      } else {
        warnings.push({
          code: 'needs_assignment',
          message: `"${node.title}" needs a designated employee`,
          nodeKey: node.resolvedKey,
        });
      }
    }

    let approverId: string | null = null;

    if (node.approvalRequired) {
      if (node.approverResolutionRule === 'project_manager' && managerId) {
        approverId = managerId;
      } else {
        warnings.push({
          code: 'needs_approver',
          message: `"${node.title}" requires approval but no approver could be resolved`,
          nodeKey: node.resolvedKey,
        });
      }
    }

    nodes.push({ ...node, jobRoleId, assignedUserId, assignmentSource, approverId });
  }

  return {
    clientId,
    clientName: client.name,
    templateId,
    templateKey: template.key,
    templateName: template.name,
    templateVersion: versionNumber,
    templateType: template.type,
    projectType: TEMPLATE_TYPE_TO_PROJECT_TYPE[template.type],
    definitionNodes: definition.nodes.length,
    nodes,
    dependencies: expansion.dependencies,
    warnings: dedupeWarnings(warnings),
    name: input.name,
    description: null,
    destination,
    startAt,
    targetAt,
    managerId: input.managerId ?? null,
    videoAdCount: input.videoAdCount,
    creativeTypes,
    templateVersionId: version._id.toString(),
  };
}

async function isEligible(
  deps: GenerationServiceDeps,
  clientId: string,
  userId: string,
  jobRoleId: string,
): Promise<boolean> {
  try {
    await resolveAssignableEmployee(deps.directory, userId, jobRoleId);
  } catch {
    return false;
  }

  return isActiveClientMember(clientId, userId);
}

async function assertEligibleMemberForManager(
  deps: GenerationServiceDeps,
  clientId: string,
  managerId: string,
): Promise<void> {
  const employee = await deps.directory.findById(managerId);

  if (!employee || employee.status !== 'active') {
    throw new ValidationError('The selected Project Manager is not active');
  }

  // Membership is asserted (and created if needed) at creation time.
  void clientId;
}

async function assertValidOverride(
  deps: GenerationServiceDeps,
  clientId: string,
  userId: string,
  jobRoleId: string | null,
  node: ExpandedNode,
): Promise<void> {
  if (!jobRoleId) {
    throw new ValidationError(`Role override supplied for "${node.title}" which has no job role`);
  }

  if (!(await isEligible(deps, clientId, userId, jobRoleId))) {
    throw new ValidationError(
      `The employee override for "${node.title}" is not an active member holding the required role`,
    );
  }
}

function toPreviewNode(node: ResolvedNode): GeneratedNodePreview {
  return {
    nodeKey: node.resolvedKey,
    templateNodeKey: node.templateNodeKey,
    parentNodeKey: node.parentResolvedKey,
    title: node.title,
    description: node.description,
    requiredJobRoleKey: node.requiredJobRoleKey,
    jobRoleId: node.jobRoleId,
    assignedUserId: node.assignedUserId,
    approvalRequired: node.approvalRequired,
    approverId: node.approverId,
    priority: node.priority,
    dueAt: node.dueAt ? node.dueAt.toISOString() : null,
    initialStatus: node.initialStatus,
    isRequired: node.isRequired,
    repeatGroup: node.repeatGroup,
    repeatIndex: node.repeatIndex,
    deadlineWarning: node.deadlineWarning,
  };
}

function toPreview(plan: GenerationPlan): ProjectGenerationPreview {
  return {
    clientId: plan.clientId,
    clientName: plan.clientName,
    templateId: plan.templateId,
    templateKey: plan.templateKey,
    templateName: plan.templateName,
    templateVersion: plan.templateVersion,
    type: plan.projectType,
    name: plan.name,
    description: plan.description,
    destination: plan.destination,
    startAt: plan.startAt.toISOString(),
    targetAt: plan.targetAt ? plan.targetAt.toISOString() : null,
    managerId: plan.managerId,
    tasks: plan.nodes.map(toPreviewNode),
    dependencies: plan.dependencies.map((edge) => ({
      predecessorNodeKey: edge.predecessorNodeKey,
      successorNodeKey: edge.successorNodeKey,
    })),
    warnings: plan.warnings,
  };
}

/** Server-validated preview (Step 22.12) — identical expansion to creation. */
export async function previewProjectFromTemplate(
  input: ProjectGenerationPreviewInput,
  deps: GenerationServiceDeps,
): Promise<ProjectGenerationPreview> {
  const plan = await buildGenerationPlan(input, deps);

  return toPreview(plan);
}

function fingerprint(plan: GenerationPlan, input: ProjectGenerationInput): string {
  const canonical = {
    clientId: plan.clientId,
    templateId: plan.templateId,
    templateVersion: plan.templateVersion,
    name: plan.name,
    destination: plan.destination,
    campaignName: input.campaignName ?? null,
    startAt: plan.startAt.toISOString(),
    targetAt: plan.targetAt ? plan.targetAt.toISOString() : null,
    managerId: plan.managerId,
    videoAdCount: plan.videoAdCount,
    creativeTypes: [...input.creativeTypes].sort(),
    roleOverrides: [...input.roleOverrides].sort((a, b) =>
      a.jobRoleKey.localeCompare(b.jobRoleKey),
    ),
    deadlineOverrides: [...input.deadlineOverrides].sort((a, b) =>
      a.nodeKey.localeCompare(b.nodeKey),
    ),
  };

  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}

async function replayResult(
  generation: {
    projectId: mongoose.Types.ObjectId;
    templateId: mongoose.Types.ObjectId;
    templateVersion: number;
    warnings: unknown;
  },
  deps: GenerationServiceDeps,
): Promise<ProjectGenerationResult> {
  const project = await findProject(generation.projectId.toString(), deps);

  if (!project) {
    throw new NotFoundError('Project');
  }

  const [taskCount, subtaskCount, dependencyCount] = await Promise.all([
    TaskModel.countDocuments({ projectId: generation.projectId, parentTaskId: null }),
    TaskModel.countDocuments({ projectId: generation.projectId, parentTaskId: { $ne: null } }),
    TaskDependencyModel.countDocuments({ projectId: generation.projectId }),
  ]);

  return {
    project,
    templateId: generation.templateId.toString(),
    templateVersion: generation.templateVersion,
    taskCount,
    subtaskCount,
    dependencyCount,
    warnings: Array.isArray(generation.warnings) ? (generation.warnings as TemplateWarning[]) : [],
    idempotentReplay: true,
  };
}

async function findGeneration(idempotencyKey: string): Promise<GenerationRecord | null> {
  const record = await ProjectGenerationModel.findOne({ idempotencyKey }).lean();

  return (record as GenerationRecord | null) ?? null;
}

interface GenerationRecord {
  projectId: mongoose.Types.ObjectId;
  templateId: mongoose.Types.ObjectId;
  templateVersion: number;
  fingerprint: string;
  warnings: unknown;
}

/**
 * Atomically create a whole project from a published template (Step 22).
 *
 * Idempotent: replaying the same key with an equivalent payload returns the
 * original project; reusing the key with different input returns a conflict.
 */
export async function instantiateProjectFromTemplate(
  input: ProjectGenerationInput,
  actorId: string,
  deps: GenerationServiceDeps,
): Promise<ProjectGenerationResult> {
  const connection = resolveConnection(deps);
  const actor = assertObjectId(actorId, 'actor');
  const plan = await buildGenerationPlan(input, deps);
  const requestFingerprint = fingerprint(plan, input);

  const existing = await findGeneration(input.idempotencyKey);

  if (existing) {
    if (existing.fingerprint !== requestFingerprint) {
      throw new ConflictError('This idempotency key was already used with different input');
    }

    return replayResult(existing, deps);
  }

  const parentNodes = plan.nodes.filter((node) => node.parentResolvedKey === null);
  const childNodes = plan.nodes.filter((node) => node.parentResolvedKey !== null);
  const projectId = new mongoose.Types.ObjectId();

  try {
    await withTransaction(
      async (session) => {
        await createProjectGraph(session, projectId, plan, input, actor);
      },
      { connection },
    );
  } catch (error) {
    if (isDuplicateKey(error)) {
      return await resolveDuplicate(input.idempotencyKey, requestFingerprint, deps);
    }

    throw error;
  }

  const project = await findProject(projectId.toString(), deps);

  if (!project) {
    throw new NotFoundError('Project');
  }

  return {
    project,
    templateId: plan.templateId,
    templateVersion: plan.templateVersion,
    taskCount: parentNodes.length,
    subtaskCount: childNodes.length,
    dependencyCount: plan.dependencies.length,
    warnings: plan.warnings,
    idempotentReplay: false,
  };
}

async function resolveDuplicate(
  idempotencyKey: string,
  requestFingerprint: string,
  deps: GenerationServiceDeps,
): Promise<ProjectGenerationResult> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const existing = await findGeneration(idempotencyKey);

    if (existing) {
      if (existing.fingerprint !== requestFingerprint) {
        throw new ConflictError('This idempotency key was already used with different input');
      }

      return replayResult(existing, deps);
    }

    await new Promise((resolve) => setTimeout(resolve, 40));
  }

  const existing = await findGeneration(idempotencyKey);

  if (existing) {
    if (existing.fingerprint !== requestFingerprint) {
      throw new ConflictError('This idempotency key was already used with different input');
    }

    return replayResult(existing, deps);
  }

  throw new ConflictError('This idempotency key is currently being processed. Retry shortly.');
}

async function createProjectGraph(
  session: ClientSession,
  projectId: mongoose.Types.ObjectId,
  plan: GenerationPlan,
  input: ProjectGenerationInput,
  actor: string,
): Promise<void> {
  const actorObjectId = new mongoose.Types.ObjectId(actor);

  await ProjectModel.create(
    [
      {
        _id: projectId,
        clientId: new mongoose.Types.ObjectId(plan.clientId),
        name: plan.name,
        description: plan.description,
        type: plan.projectType,
        status: 'planned',
        managerId: plan.managerId ? new mongoose.Types.ObjectId(plan.managerId) : null,
        startAt: plan.startAt,
        targetAt: plan.targetAt,
        templateId: new mongoose.Types.ObjectId(plan.templateId),
        templateVersion: plan.templateVersion,
        dependencyVersion: plan.dependencies.length,
        createdBy: actorObjectId,
        updatedBy: actorObjectId,
      },
    ],
    { session },
  );

  if (plan.managerId) {
    await ensureActiveMembership(plan.clientId, plan.managerId, actor, 'project manager');
  }

  // A template that declares a recurring weekly-review node starts a per-project
  // campaign-review schedule, which the worker advances one period at a time.
  if (plan.nodes.some((node) => node.resolvedKey === 'weekly_review')) {
    await ensureCampaignReviewSchedule(
      {
        projectId: projectId.toString(),
        clientId: plan.clientId,
        anchorAt: plan.startAt ?? new Date(),
        intervalDays: DEFAULT_REVIEW_INTERVAL_DAYS,
        createdBy: actor,
      },
      { session },
    );
  }

  const taskIdByKey = new Map<string, mongoose.Types.ObjectId>();
  const parents = plan.nodes.filter((node) => node.parentResolvedKey === null);
  const children = plan.nodes.filter((node) => node.parentResolvedKey !== null);

  await insertTasks(session, projectId, parents, null, taskIdByKey, actorObjectId);

  for (const child of children) {
    const parentId = child.parentResolvedKey ? taskIdByKey.get(child.parentResolvedKey) : undefined;

    if (!parentId) {
      throw new ValidationError('A generated subtask is missing its parent task');
    }

    await insertTasks(session, projectId, [child], parentId, taskIdByKey, actorObjectId);
  }

  for (const edge of plan.dependencies) {
    const predecessorTaskId = taskIdByKey.get(edge.predecessorNodeKey);
    const successorTaskId = taskIdByKey.get(edge.successorNodeKey);

    if (!predecessorTaskId || !successorTaskId) {
      throw new ValidationError('A generated dependency references a missing task');
    }

    await TaskDependencyModel.create(
      [
        {
          projectId,
          predecessorTaskId,
          successorTaskId,
          createdBy: actorObjectId,
        },
      ],
      { session },
    );
  }

  await ProjectGenerationModel.create(
    [
      {
        idempotencyKey: input.idempotencyKey,
        fingerprint: fingerprint(plan, input),
        actorId: actorObjectId,
        clientId: new mongoose.Types.ObjectId(plan.clientId),
        templateId: new mongoose.Types.ObjectId(plan.templateId),
        templateVersion: plan.templateVersion,
        projectId,
        warnings: plan.warnings,
      },
    ],
    { session },
  );

  await recordAudit({
    actorId: actor,
    action: 'project.generate',
    entityType: 'project',
    entityId: projectId.toString(),
    previousValue: null,
    newValue: {
      templateId: plan.templateId,
      templateVersion: plan.templateVersion,
      taskCount: plan.nodes.length,
      dependencyCount: plan.dependencies.length,
    },
    notes: null,
    session,
  });
}

async function insertTasks(
  session: ClientSession,
  projectId: mongoose.Types.ObjectId,
  nodes: ResolvedNode[],
  parentTaskId: mongoose.Types.ObjectId | null,
  taskIdByKey: Map<string, mongoose.Types.ObjectId>,
  actorObjectId: mongoose.Types.ObjectId,
): Promise<void> {
  if (nodes.length === 0) {
    return;
  }

  const documents = nodes.map((node) => ({
    projectId,
    parentTaskId,
    title: node.title,
    description: node.description,
    assignedUserId: node.assignedUserId ? new mongoose.Types.ObjectId(node.assignedUserId) : null,
    assignedJobRoleId: node.jobRoleId ? new mongoose.Types.ObjectId(node.jobRoleId) : null,
    dueAt: node.dueAt,
    priority: node.priority,
    status: node.initialStatus,
    approvalRequired: node.approvalRequired,
    approverId: node.approverId ? new mongoose.Types.ObjectId(node.approverId) : null,
    sopUrl: node.sopUrl,
    referenceUrl: node.referenceUrl,
    autoAssign: false,
    assignmentSource: node.assignedUserId ? node.assignmentSource : null,
    createdBy: actorObjectId,
    updatedBy: actorObjectId,
  }));

  const created = await TaskModel.create(documents, { session, ordered: true });

  created.forEach((document, index) => {
    const node = nodes[index];

    if (node) {
      taskIdByKey.set(node.resolvedKey, document._id);
    }
  });

  for (const [index, document] of created.entries()) {
    const node = nodes[index];

    if (node?.assignedUserId) {
      await notifyTaskAssignment(
        document._id.toString(),
        { recipientUserId: node.assignedUserId, previousAssigneeId: null },
        { session },
      );
    }
  }
}

function isDuplicateKey(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 11000
  );
}
