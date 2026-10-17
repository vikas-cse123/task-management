import {
  DEFAULT_TEMPLATE_STATUS,
  type CreateTemplateInput,
  type PublishTemplateInput,
  type TemplateDetail,
  type TemplateDraftInput,
  type TemplateListQuery,
  type TemplateNodeInput,
  type TemplateNodeView,
  type TemplateSummary,
  type TemplateValidationIssue,
  type TemplateValidationResult,
  type TemplateVersionDetail,
  type TemplateVersionSummary,
  type UpdateTemplateInput,
} from '@interscale/shared';
import mongoose from 'mongoose';
import type { ClientSession, Connection } from 'mongoose';
import { getConnection, withTransaction } from '../connection';
import { assertObjectId } from '../lib/object-id';
import {
  ConcurrentModificationError,
  ConflictError,
  NotFoundError,
  ValidationError,
} from '../lib/errors';
import { TemplateDependencyModel } from '../models/template-dependency';
import { TemplateNodeModel } from '../models/template-node';
import { TemplateVersionModel } from '../models/template-version';
import { TemplateModel } from '../models/template';
import { recordAudit } from './audit.service';
import { validateTemplateDefinition, type TemplateDefinition } from './template-validation';

/**
 * Admin-managed template administration (Phase 4, Step 19).
 *
 * Versioning strategy: nodes/dependencies live in version-scoped collections.
 * A template always has at most one editable `draft` version; publishing flips
 * it to `published` (immutable), archives the previously published version and
 * opens a fresh empty draft. Published versions are therefore immutable by
 * construction, and historical projects keep resolving their original version.
 */

export interface TemplateServiceOptions {
  connection?: Connection;
  session?: ClientSession;
}

function resolveConnection(options: TemplateServiceOptions): Connection {
  return options.connection ?? getConnection();
}

function writeOptions(session: ClientSession | undefined): { session?: ClientSession } {
  return session ? { session } : {};
}

function asIso(value: Date | null | undefined): string | null {
  return value instanceof Date ? value.toISOString() : null;
}

function asNullableId(value: mongoose.Types.ObjectId | null | undefined): string | null {
  return value ? value.toString() : null;
}

function toSummary(
  doc: {
    _id: mongoose.Types.ObjectId;
    key: string;
    name: string;
    description: string | null;
    type: TemplateSummary['type'];
    status: TemplateSummary['status'];
    currentPublishedVersion: number | null;
    createdBy?: mongoose.Types.ObjectId | null;
    updatedBy?: mongoose.Types.ObjectId | null;
    __v?: number;
    createdAt: Date;
    updatedAt: Date;
  },
  taskDefinitionCount: number,
): TemplateSummary {
  return {
    id: doc._id.toString(),
    key: doc.key,
    name: doc.name,
    description: doc.description ?? null,
    type: doc.type,
    status: doc.status,
    currentPublishedVersion: doc.currentPublishedVersion ?? null,
    createdBy: asNullableId(doc.createdBy),
    updatedBy: asNullableId(doc.updatedBy),
    version: typeof doc.__v === 'number' ? doc.__v : 0,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
    taskDefinitionCount,
  };
}

function toVersionSummary(
  doc: {
    _id: mongoose.Types.ObjectId;
    templateId: mongoose.Types.ObjectId;
    version: number;
    status: TemplateVersionSummary['status'];
    notes: string | null;
    basedOnVersion: number | null;
    createdBy?: mongoose.Types.ObjectId | null;
    updatedBy?: mongoose.Types.ObjectId | null;
    publishedBy?: mongoose.Types.ObjectId | null;
    publishedAt?: Date | null;
    createdAt: Date;
    updatedAt: Date;
  },
  nodeCount: number,
): TemplateVersionSummary {
  return {
    id: doc._id.toString(),
    templateId: doc.templateId.toString(),
    version: doc.version,
    status: doc.status,
    notes: doc.notes ?? null,
    basedOnVersion: doc.basedOnVersion ?? null,
    nodeCount,
    createdBy: asNullableId(doc.createdBy),
    updatedBy: asNullableId(doc.updatedBy),
    publishedBy: asNullableId(doc.publishedBy),
    publishedAt: asIso(doc.publishedAt),
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

function toNodeView(doc: {
  nodeKey: string;
  parentNodeKey: string | null;
  titleTemplate: string;
  descriptionTemplate: string | null;
  requiredJobRoleKey: TemplateNodeView['requiredJobRoleKey'];
  priority: TemplateNodeView['priority'];
  approvalRequired: boolean;
  approverResolutionRule: TemplateNodeView['approverResolutionRule'];
  assignmentRule: TemplateNodeView['assignmentRule'];
  relativeDueRule: TemplateNodeView['relativeDueRule'];
  isRequired: boolean;
  repeatGroup: string | null;
  sopUrl: string | null;
  referenceUrl: string | null;
  sortOrder: number;
}): TemplateNodeView {
  return {
    nodeKey: doc.nodeKey,
    parentNodeKey: doc.parentNodeKey ?? null,
    titleTemplate: doc.titleTemplate,
    descriptionTemplate: doc.descriptionTemplate ?? null,
    requiredJobRoleKey: doc.requiredJobRoleKey ?? null,
    priority: doc.priority,
    approvalRequired: doc.approvalRequired,
    approverResolutionRule: doc.approverResolutionRule,
    assignmentRule: doc.assignmentRule,
    relativeDueRule: doc.relativeDueRule
      ? {
          anchor: doc.relativeDueRule.anchor,
          offsetDays: doc.relativeDueRule.offsetDays,
          timeOfDay: doc.relativeDueRule.timeOfDay,
        }
      : null,
    isRequired: doc.isRequired,
    repeatGroup: doc.repeatGroup ?? null,
    sopUrl: doc.sopUrl ?? null,
    referenceUrl: doc.referenceUrl ?? null,
    sortOrder: doc.sortOrder,
  };
}

/** Count of nodes per template version id. */
async function countNodesByVersion(
  versionIds: mongoose.Types.ObjectId[],
  options: TemplateServiceOptions,
): Promise<Map<string, number>> {
  if (versionIds.length === 0) {
    return new Map();
  }

  const rows = await TemplateNodeModel.aggregate<{ _id: mongoose.Types.ObjectId; count: number }>([
    { $match: { templateVersionId: { $in: versionIds } } },
    { $group: { _id: '$templateVersionId', count: { $sum: 1 } } },
  ]).session(options.session ?? null);

  return new Map(rows.map((row) => [row._id.toString(), row.count]));
}

/** Load the editable content of one template version. */
export async function loadTemplateDefinition(
  templateVersionId: string,
  options: TemplateServiceOptions = {},
): Promise<TemplateDefinition> {
  void resolveConnection(options);

  const objectId = new mongoose.Types.ObjectId(
    assertObjectId(templateVersionId, 'template version'),
  );
  const [nodes, dependencies] = await Promise.all([
    TemplateNodeModel.find({ templateVersionId: objectId })
      .sort({ sortOrder: 1, nodeKey: 1 })
      .session(options.session ?? null)
      .lean(),
    TemplateDependencyModel.find({ templateVersionId: objectId })
      .sort({ predecessorNodeKey: 1, successorNodeKey: 1 })
      .session(options.session ?? null)
      .lean(),
  ]);

  return {
    nodes: nodes.map((node) => toNodeView(node) as TemplateNodeInput),
    dependencies: dependencies.map((edge) => ({
      predecessorNodeKey: edge.predecessorNodeKey,
      successorNodeKey: edge.successorNodeKey,
    })),
  };
}

export interface TemplateListResult {
  readonly data: TemplateSummary[];
  readonly nextCursor: string | null;
}

/** List templates (Admin sees all; Managers only need published ones). */
export async function listTemplates(
  query: TemplateListQuery,
  options: TemplateServiceOptions = {},
): Promise<TemplateListResult> {
  void resolveConnection(options);

  const filter: {
    status?: TemplateSummary['status'];
    type?: TemplateSummary['type'];
    name?: { $regex: string; $options: string };
    _id?: { $gt: mongoose.Types.ObjectId };
  } = {};

  if (query.status) filter.status = query.status;
  if (query.type) filter.type = query.type;

  if (query.search && query.search.length > 0) {
    filter.name = { $regex: query.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
  }

  if (query.cursor) {
    filter._id = { $gt: new mongoose.Types.ObjectId(query.cursor) };
  }

  const documents = await TemplateModel.find(filter)
    .sort({ _id: 1 })
    .limit(query.limit + 1)
    .session(options.session ?? null)
    .lean();

  const hasMore = documents.length > query.limit;
  const page = hasMore ? documents.slice(0, query.limit) : documents;

  const publishedVersions = await TemplateVersionModel.find({
    templateId: { $in: page.map((doc) => doc._id) },
    status: 'published',
  })
    .session(options.session ?? null)
    .lean();

  const counts = await countNodesByVersion(
    publishedVersions.map((version) => version._id),
    options,
  );

  const countByTemplate = new Map<string, number>();

  for (const version of publishedVersions) {
    countByTemplate.set(version.templateId.toString(), counts.get(version._id.toString()) ?? 0);
  }

  return {
    data: page.map((doc) => toSummary(doc, countByTemplate.get(doc._id.toString()) ?? 0)),
    nextCursor: hasMore && page.length > 0 ? (page[page.length - 1]?._id.toString() ?? null) : null,
  };
}

/** Find a single template summary, or `null`. */
export async function findTemplate(
  id: string,
  options: TemplateServiceOptions = {},
): Promise<TemplateSummary | null> {
  void resolveConnection(options);

  let objectId: mongoose.Types.ObjectId;

  try {
    objectId = new mongoose.Types.ObjectId(assertObjectId(id, 'template'));
  } catch {
    return null;
  }

  const doc = await TemplateModel.findById(objectId)
    .session(options.session ?? null)
    .lean();

  if (!doc) {
    return null;
  }

  let count = 0;

  if (doc.currentPublishedVersion !== null) {
    const version = await TemplateVersionModel.findOne({
      templateId: objectId,
      version: doc.currentPublishedVersion,
      status: 'published',
    })
      .session(options.session ?? null)
      .select({ _id: 1 })
      .lean();

    if (version) {
      count = await TemplateNodeModel.countDocuments({ templateVersionId: version._id }).session(
        options.session ?? null,
      );
    }
  }

  return toSummary(doc, count);
}

/** Template detail: summary plus version history and draft marker. */
export async function findTemplateDetail(
  id: string,
  options: TemplateServiceOptions = {},
): Promise<TemplateDetail | null> {
  const templateId = assertObjectId(id, 'template');
  const summary = await findTemplate(id, options);

  if (!summary) {
    return null;
  }

  const versions = await TemplateVersionModel.find({ templateId })
    .sort({ version: -1 })
    .session(options.session ?? null)
    .lean();

  const counts = await countNodesByVersion(
    versions.map((version) => version._id),
    options,
  );

  const draft = versions.find((version) => version.status === 'draft') ?? null;

  return {
    ...summary,
    versions: versions.map((version) =>
      toVersionSummary(version, counts.get(version._id.toString()) ?? 0),
    ),
    draftVersion: draft ? draft.version : null,
    draftNodeCount: draft ? (counts.get(draft._id.toString()) ?? 0) : 0,
  };
}

/** List version summaries for a template. */
export async function listTemplateVersions(
  id: string,
  options: TemplateServiceOptions = {},
): Promise<TemplateVersionSummary[]> {
  void resolveConnection(options);

  const templateId = new mongoose.Types.ObjectId(assertObjectId(id, 'template'));
  const versions = await TemplateVersionModel.find({ templateId })
    .sort({ version: -1 })
    .session(options.session ?? null)
    .lean();

  const counts = await countNodesByVersion(
    versions.map((version) => version._id),
    options,
  );

  return versions.map((version) =>
    toVersionSummary(version, counts.get(version._id.toString()) ?? 0),
  );
}

/** Get one version's full content. */
export async function getTemplateVersion(
  id: string,
  version: number,
  options: TemplateServiceOptions = {},
): Promise<TemplateVersionDetail | null> {
  void resolveConnection(options);

  const templateId = new mongoose.Types.ObjectId(assertObjectId(id, 'template'));
  const doc = await TemplateVersionModel.findOne({ templateId, version })
    .session(options.session ?? null)
    .lean();

  if (!doc) {
    return null;
  }

  const definition = await loadTemplateDefinition(doc._id.toString(), options);

  return {
    ...toVersionSummary(doc, definition.nodes.length),
    nodes: definition.nodes.map((node) => node as TemplateNodeView),
    dependencies: [...definition.dependencies],
  };
}

async function findDraftVersion(
  templateId: mongoose.Types.ObjectId,
  session: ClientSession | undefined,
): Promise<{ _id: mongoose.Types.ObjectId; version: number } | null> {
  return TemplateVersionModel.findOne({ templateId, status: 'draft' })
    .session(session ?? null)
    .select({ version: 1 })
    .lean();
}

async function writeDefinition(
  templateId: mongoose.Types.ObjectId,
  version: { _id: mongoose.Types.ObjectId; version: number },
  draft: TemplateDraftInput,
  actorId: string,
  session: ClientSession | undefined,
): Promise<void> {
  await TemplateNodeModel.deleteMany({ templateVersionId: version._id }).session(session ?? null);
  await TemplateDependencyModel.deleteMany({ templateVersionId: version._id }).session(
    session ?? null,
  );

  if (draft.nodes.length > 0) {
    await TemplateNodeModel.insertMany(
      draft.nodes.map((node) => ({
        templateId,
        templateVersionId: version._id,
        version: version.version,
        nodeKey: node.nodeKey,
        parentNodeKey: node.parentNodeKey,
        titleTemplate: node.titleTemplate,
        descriptionTemplate: node.descriptionTemplate,
        requiredJobRoleKey: node.requiredJobRoleKey,
        priority: node.priority,
        approvalRequired: node.approvalRequired,
        approverResolutionRule: node.approverResolutionRule,
        assignmentRule: node.assignmentRule,
        relativeDueRule: node.relativeDueRule,
        isRequired: node.isRequired,
        repeatGroup: node.repeatGroup,
        sopUrl: node.sopUrl,
        referenceUrl: node.referenceUrl,
        sortOrder: node.sortOrder,
      })),
      writeOptions(session),
    );
  }

  if (draft.dependencies.length > 0) {
    await TemplateDependencyModel.insertMany(
      draft.dependencies.map((edge) => ({
        templateId,
        templateVersionId: version._id,
        version: version.version,
        predecessorNodeKey: edge.predecessorNodeKey,
        successorNodeKey: edge.successorNodeKey,
      })),
      writeOptions(session),
    );
  }

  await TemplateVersionModel.updateOne(
    { _id: version._id },
    { $set: { updatedBy: new mongoose.Types.ObjectId(assertObjectId(actorId, 'actor')) } },
    writeOptions(session),
  );
}

/** Create a template with an initial empty (or supplied) draft version. */
export async function createTemplateRecord(
  input: CreateTemplateInput,
  actorId: string,
  options: TemplateServiceOptions = {},
): Promise<TemplateSummary> {
  void resolveConnection(options);

  const draft: TemplateDraftInput = input.draft ?? { nodes: [], dependencies: [] };
  const issues = validateTemplateDefinition(
    { nodes: draft.nodes, dependencies: draft.dependencies },
    { name: input.name, type: input.type },
    { requireContent: false },
  );

  if (issues.length > 0) {
    throw new ValidationError(`The template draft is invalid: ${formatIssues(issues)}`);
  }

  const actor = new mongoose.Types.ObjectId(assertObjectId(actorId, 'actor'));
  let templateId: mongoose.Types.ObjectId;

  try {
    const [document] = await TemplateModel.create([
      {
        key: input.key,
        name: input.name,
        description: input.description,
        type: input.type,
        status: DEFAULT_TEMPLATE_STATUS,
        currentPublishedVersion: null,
        createdBy: actor,
        updatedBy: actor,
      },
    ]);

    if (!document) {
      throw new ValidationError('Failed to create template');
    }

    templateId = document._id;

    const [version] = await TemplateVersionModel.create([
      {
        templateId,
        version: 1,
        status: 'draft',
        basedOnVersion: null,
        createdBy: actor,
        updatedBy: actor,
      },
    ]);

    if (!version) {
      throw new ValidationError('Failed to create the initial template version');
    }

    await writeDefinition(templateId, { _id: version._id, version: 1 }, draft, actorId, undefined);
  } catch (error) {
    if (isDuplicateKey(error)) {
      throw new ConflictError('A template with this key already exists');
    }

    throw error;
  }

  await recordAudit({
    actorId,
    action: 'template.create',
    entityType: 'template',
    entityId: templateId.toString(),
    previousValue: null,
    newValue: { key: input.key, name: input.name, type: input.type },
    notes: null,
  });

  const created = await findTemplate(templateId.toString(), options);

  if (!created) {
    throw new NotFoundError('Template');
  }

  return created;
}

/** Update template metadata (name/description/type). */
export async function updateTemplateRecord(
  id: string,
  input: UpdateTemplateInput,
  actorId: string,
  options: TemplateServiceOptions = {},
): Promise<TemplateSummary> {
  void resolveConnection(options);

  const templateId = assertObjectId(id, 'template');
  const document = await TemplateModel.findById(templateId).session(options.session ?? null);

  if (!document) {
    throw new NotFoundError('Template');
  }

  if (document.status === 'archived') {
    throw new ValidationError('An archived template cannot be edited');
  }

  if (input.expectedVersion !== undefined && document.__v !== input.expectedVersion) {
    throw new ConcurrentModificationError();
  }

  const previous = { name: document.name, description: document.description, type: document.type };

  if (input.name !== undefined) document.name = input.name;
  if (input.description !== undefined) document.description = input.description;
  if (input.type !== undefined) document.type = input.type;
  document.updatedBy = new mongoose.Types.ObjectId(assertObjectId(actorId, 'actor'));

  try {
    await document.save(writeOptions(options.session));
  } catch (error) {
    if (error instanceof Error && error.name === 'VersionError') {
      throw new ConcurrentModificationError();
    }

    throw error;
  }

  await recordAudit({
    actorId,
    action: 'template.update',
    entityType: 'template',
    entityId: templateId,
    previousValue: previous,
    newValue: { name: document.name, description: document.description, type: document.type },
    notes: null,
    session: options.session,
  });

  const updated = await findTemplate(templateId, options);

  if (!updated) {
    throw new NotFoundError('Template');
  }

  return updated;
}

/** Replace the editable draft content of a template version. */
export async function replaceDraftContent(
  id: string,
  draft: TemplateDraftInput,
  actorId: string,
  options: TemplateServiceOptions = {},
): Promise<TemplateVersionDetail> {
  void resolveConnection(options);

  const templateId = new mongoose.Types.ObjectId(assertObjectId(id, 'template'));
  const template = await TemplateModel.findById(templateId)
    .session(options.session ?? null)
    .lean();

  if (!template) {
    throw new NotFoundError('Template');
  }

  if (template.status === 'archived') {
    throw new ValidationError('An archived template cannot be edited');
  }

  const issues = validateTemplateDefinition(
    { nodes: draft.nodes, dependencies: draft.dependencies },
    { name: template.name, type: template.type },
    { requireContent: false },
  );

  if (issues.length > 0) {
    throw new ValidationError(`The template draft is invalid: ${formatIssues(issues)}`);
  }

  let version = await findDraftVersion(templateId, options.session);

  if (!version) {
    const [created] = await TemplateVersionModel.create([
      {
        templateId,
        version: (template.currentPublishedVersion ?? 0) + 1,
        status: 'draft',
        basedOnVersion: template.currentPublishedVersion,
        createdBy: new mongoose.Types.ObjectId(assertObjectId(actorId, 'actor')),
        updatedBy: new mongoose.Types.ObjectId(assertObjectId(actorId, 'actor')),
      },
    ]);

    if (!created) {
      throw new ValidationError('Failed to create a draft version');
    }

    version = { _id: created._id, version: created.version };
  }

  try {
    await writeDefinition(templateId, version, draft, actorId, options.session);
  } catch (error) {
    if (isDuplicateKey(error)) {
      throw new ValidationError('The template draft contains duplicate node keys');
    }

    throw error;
  }

  await recordAudit({
    actorId,
    action: 'template.update',
    entityType: 'template_version',
    entityId: version._id.toString(),
    previousValue: null,
    newValue: { nodeCount: draft.nodes.length, dependencyCount: draft.dependencies.length },
    notes: null,
    session: options.session,
  });

  const detail = await getTemplateVersion(id, version.version, options);

  if (!detail) {
    throw new NotFoundError('Template version');
  }

  return detail;
}

/** Ensure a draft version exists (cloning the published version when needed). */
export async function ensureDraftVersion(
  id: string,
  actorId: string,
  options: TemplateServiceOptions = {},
): Promise<TemplateVersionDetail> {
  void resolveConnection(options);

  const templateId = new mongoose.Types.ObjectId(assertObjectId(id, 'template'));
  const template = await TemplateModel.findById(templateId)
    .session(options.session ?? null)
    .lean();

  if (!template) {
    throw new NotFoundError('Template');
  }

  if (template.status === 'archived') {
    throw new ValidationError('An archived template cannot be edited');
  }

  const existing = await findDraftVersion(templateId, options.session);

  if (existing) {
    const detail = await getTemplateVersion(id, existing.version, options);

    if (!detail) {
      throw new NotFoundError('Template version');
    }

    return detail;
  }

  const actor = new mongoose.Types.ObjectId(assertObjectId(actorId, 'actor'));
  const nextVersion =
    (
      await TemplateVersionModel.findOne({ templateId })
        .sort({ version: -1 })
        .select({ version: 1 })
        .session(options.session ?? null)
        .lean()
    )?.version ?? 0;

  const [created] = await TemplateVersionModel.create([
    {
      templateId,
      version: nextVersion + 1,
      status: 'draft',
      basedOnVersion: template.currentPublishedVersion,
      createdBy: actor,
      updatedBy: actor,
    },
  ]);

  if (!created) {
    throw new ValidationError('Failed to create a draft version');
  }

  if (template.currentPublishedVersion !== null) {
    const published = await TemplateVersionModel.findOne({
      templateId,
      version: template.currentPublishedVersion,
      status: 'published',
    })
      .session(options.session ?? null)
      .lean();

    if (published) {
      const definition = await loadTemplateDefinition(published._id.toString(), options);
      await writeDefinition(
        templateId,
        { _id: created._id, version: created.version },
        { nodes: [...definition.nodes], dependencies: [...definition.dependencies] },
        actorId,
        options.session,
      );
    }
  }

  const detail = await getTemplateVersion(id, created.version, options);

  if (!detail) {
    throw new NotFoundError('Template version');
  }

  return detail;
}

/** Validate a version's content (defaults to the draft, else the published version). */
export async function validateTemplateVersion(
  id: string,
  version: number | undefined,
  options: TemplateServiceOptions = {},
): Promise<{ version: number; result: TemplateValidationResult }> {
  void resolveConnection(options);

  const templateId = new mongoose.Types.ObjectId(assertObjectId(id, 'template'));
  const template = await TemplateModel.findById(templateId)
    .session(options.session ?? null)
    .lean();

  if (!template) {
    throw new NotFoundError('Template');
  }

  const target =
    version !== undefined
      ? await TemplateVersionModel.findOne({ templateId, version })
          .session(options.session ?? null)
          .lean()
      : ((await findDraftVersion(templateId, options.session)) ??
        (template.currentPublishedVersion !== null
          ? await TemplateVersionModel.findOne({
              templateId,
              version: template.currentPublishedVersion,
            })
              .session(options.session ?? null)
              .lean()
          : null));

  if (!target) {
    throw new NotFoundError('Template version');
  }

  const definition = await loadTemplateDefinition(target._id.toString(), options);
  const errors = validateTemplateDefinition(definition, {
    name: template.name,
    type: template.type,
  });

  return { version: target.version, result: { valid: errors.length === 0, errors } };
}

/** Publish a draft version: immutable, current, and archives the previous one. */
export async function publishTemplateVersion(
  id: string,
  input: PublishTemplateInput,
  actorId: string,
  options: TemplateServiceOptions = {},
): Promise<TemplateSummary> {
  const connection = resolveConnection(options);
  const templateId = assertObjectId(id, 'template');
  const actor = new mongoose.Types.ObjectId(assertObjectId(actorId, 'actor'));

  const template = await TemplateModel.findById(templateId).session(options.session ?? null);

  if (!template) {
    throw new NotFoundError('Template');
  }

  if (template.status === 'archived') {
    throw new ValidationError('An archived template cannot be published');
  }

  if (input.expectedVersion !== undefined && template.__v !== input.expectedVersion) {
    throw new ConcurrentModificationError();
  }

  const draft =
    input.version !== undefined
      ? await TemplateVersionModel.findOne({ templateId, version: input.version }).session(
          options.session ?? null,
        )
      : await TemplateVersionModel.findOne({ templateId, status: 'draft' }).session(
          options.session ?? null,
        );

  if (!draft) {
    throw new NotFoundError('Draft template version');
  }

  if (draft.status === 'published') {
    throw new ValidationError('This template version is already published');
  }

  if (draft.status === 'archived') {
    throw new ValidationError('An archived template version cannot be published');
  }

  const definition = await loadTemplateDefinition(draft._id.toString(), options);
  const errors = validateTemplateDefinition(definition, {
    name: template.name,
    type: template.type,
  });

  if (errors.length > 0) {
    throw new ValidationError(`The template cannot be published: ${formatIssues(errors)}`);
  }

  try {
    await withTransaction(
      async (session) => {
        const previouslyPublished = await TemplateVersionModel.findOne({
          templateId: new mongoose.Types.ObjectId(templateId),
          status: 'published',
        }).session(session);

        if (previouslyPublished) {
          previouslyPublished.status = 'archived';
          previouslyPublished.updatedBy = actor;
          await previouslyPublished.save({ session });
        }

        draft.status = 'published';
        if (input.notes !== undefined) draft.notes = input.notes;
        draft.publishedBy = actor;
        draft.publishedAt = new Date();
        draft.updatedBy = actor;
        await draft.save({ session });

        const current = await TemplateModel.findById(templateId).session(session);

        if (!current) {
          throw new NotFoundError('Template');
        }

        current.currentPublishedVersion = draft.version;
        current.status = 'published';
        current.updatedBy = actor;
        await current.save({ session });

        await TemplateVersionModel.create(
          [
            {
              templateId: new mongoose.Types.ObjectId(templateId),
              version: draft.version + 1,
              status: 'draft',
              basedOnVersion: draft.version,
              createdBy: actor,
              updatedBy: actor,
            },
          ],
          { session },
        );

        await recordAudit({
          actorId,
          action: 'template.publish',
          entityType: 'template',
          entityId: templateId,
          previousValue: {
            currentPublishedVersion: previouslyPublished?.version ?? null,
          },
          newValue: { currentPublishedVersion: draft.version },
          notes: input.notes ?? null,
          session,
        });
      },
      { connection },
    );
  } catch (error) {
    if (error instanceof Error && error.name === 'VersionError') {
      throw new ConcurrentModificationError();
    }

    if (isDuplicateKey(error)) {
      throw new ConflictError('Another publish completed concurrently. Reload and try again.');
    }

    throw error;
  }

  const published = await findTemplate(templateId, options);

  if (!published) {
    throw new NotFoundError('Template');
  }

  return published;
}

/** Archive a template: retired from project creation, kept for history. */
export async function archiveTemplateRecord(
  id: string,
  reason: string,
  actorId: string,
  options: TemplateServiceOptions = {},
): Promise<TemplateSummary> {
  void resolveConnection(options);

  const templateId = assertObjectId(id, 'template');
  const document = await TemplateModel.findById(templateId).session(options.session ?? null);

  if (!document) {
    throw new NotFoundError('Template');
  }

  if (document.status === 'archived') {
    throw new ValidationError('This template is already archived');
  }

  const previous = document.status;
  document.status = 'archived';
  document.updatedBy = new mongoose.Types.ObjectId(assertObjectId(actorId, 'actor'));

  try {
    await document.save(writeOptions(options.session));
  } catch (error) {
    if (error instanceof Error && error.name === 'VersionError') {
      throw new ConcurrentModificationError();
    }

    throw error;
  }

  await TemplateVersionModel.updateMany(
    { templateId: new mongoose.Types.ObjectId(templateId), status: 'draft' },
    { $set: { status: 'archived' } },
    writeOptions(options.session),
  );

  await recordAudit({
    actorId,
    action: 'template.archive',
    entityType: 'template',
    entityId: templateId,
    previousValue: { status: previous },
    newValue: { status: 'archived' },
    notes: reason,
    session: options.session,
  });

  const archived = await findTemplate(templateId, options);

  if (!archived) {
    throw new NotFoundError('Template');
  }

  return archived;
}

function isDuplicateKey(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 11000
  );
}

function formatIssues(issues: TemplateValidationIssue[]): string {
  return issues.map((entry) => entry.message).join('; ');
}
