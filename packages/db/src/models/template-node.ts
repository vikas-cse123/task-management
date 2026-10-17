import {
  DEFAULT_DEADLINE_ANCHOR,
  DEFAULT_DEADLINE_TIME_OF_DAY,
  DEFAULT_TASK_PRIORITY,
  DEFAULT_TEMPLATE_APPROVER_RULE,
  DEFAULT_TEMPLATE_ASSIGNMENT_RULE,
  DEADLINE_ANCHORS,
  JOB_ROLE_KEYS,
  TASK_PRIORITIES,
  TEMPLATE_APPROVER_RULES,
  TEMPLATE_ASSIGNMENT_RULES,
  type DeadlineAnchor,
  type JobRoleKey,
  type TaskPriority,
  type TemplateApproverRule,
  type TemplateAssignmentRule,
} from '@interscale/shared';
import mongoose from 'mongoose';
import type { HydratedDocument, Model, Types } from 'mongoose';

const { Schema, model, models } = mongoose;

export interface RelativeDueRule {
  anchor: DeadlineAnchor;
  offsetDays: number;
  timeOfDay: string;
}

/**
 * A reusable task/subtask definition (Phase 4, Step 19.5).
 *
 * Nodes are definitions, never executable tasks: creating a project expands
 * them into real Task records. `nodeKey` is stable and unique within a template
 * version; `parentNodeKey` expresses one-level subtask nesting. `repeatGroup`
 * (e.g. `video_ad`) marks nodes duplicated once per selected creative instance
 * during expansion.
 */
export interface TemplateNode {
  templateId: Types.ObjectId;
  templateVersionId: Types.ObjectId;
  version: number;
  nodeKey: string;
  parentNodeKey: string | null;
  titleTemplate: string;
  descriptionTemplate: string | null;
  requiredJobRoleKey: JobRoleKey | null;
  priority: TaskPriority;
  approvalRequired: boolean;
  approverResolutionRule: TemplateApproverRule;
  assignmentRule: TemplateAssignmentRule;
  relativeDueRule: RelativeDueRule | null;
  isRequired: boolean;
  repeatGroup: string | null;
  sopUrl: string | null;
  referenceUrl: string | null;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

export type TemplateNodeDocument = HydratedDocument<TemplateNode>;

const relativeDueRuleSchema = new Schema<RelativeDueRule>(
  {
    anchor: {
      type: String,
      required: true,
      enum: [...DEADLINE_ANCHORS],
      default: DEFAULT_DEADLINE_ANCHOR,
    },
    offsetDays: { type: Number, required: true, min: 0, max: 365 },
    timeOfDay: {
      type: String,
      required: true,
      default: DEFAULT_DEADLINE_TIME_OF_DAY,
      match: /^([01]\d|2[0-3]):[0-5]\d$/,
    },
  },
  { _id: false },
);

export const templateNodeSchema = new Schema<TemplateNode>(
  {
    templateId: { type: Schema.Types.ObjectId, ref: 'Template', required: true, index: true },
    templateVersionId: {
      type: Schema.Types.ObjectId,
      ref: 'TemplateVersion',
      required: true,
      index: true,
    },
    version: { type: Number, required: true, min: 1 },
    nodeKey: { type: String, required: true, trim: true, maxlength: 80 },
    parentNodeKey: { type: String, default: null, trim: true, maxlength: 80 },
    titleTemplate: { type: String, required: true, trim: true, maxlength: 200 },
    descriptionTemplate: { type: String, default: null, maxlength: 2000 },
    requiredJobRoleKey: { type: String, default: null, enum: [...JOB_ROLE_KEYS, null] },
    priority: {
      type: String,
      required: true,
      enum: [...TASK_PRIORITIES],
      default: DEFAULT_TASK_PRIORITY,
    },
    approvalRequired: { type: Boolean, required: true, default: false },
    approverResolutionRule: {
      type: String,
      required: true,
      enum: [...TEMPLATE_APPROVER_RULES],
      default: DEFAULT_TEMPLATE_APPROVER_RULE,
    },
    assignmentRule: {
      type: String,
      required: true,
      enum: [...TEMPLATE_ASSIGNMENT_RULES],
      default: DEFAULT_TEMPLATE_ASSIGNMENT_RULE,
    },
    relativeDueRule: { type: relativeDueRuleSchema, default: null },
    isRequired: { type: Boolean, required: true, default: true },
    repeatGroup: { type: String, default: null, trim: true, maxlength: 80 },
    sopUrl: { type: String, default: null, maxlength: 2000 },
    referenceUrl: { type: String, default: null, maxlength: 2000 },
    sortOrder: { type: Number, required: true, default: 0, min: 0 },
  },
  { timestamps: true, optimisticConcurrency: true },
);

templateNodeSchema.index(
  { templateVersionId: 1, nodeKey: 1 },
  { unique: true, name: 'uniq_template_node_key' },
);
templateNodeSchema.index({ templateVersionId: 1, sortOrder: 1 });

export const TemplateNodeModel: Model<TemplateNode> =
  (models['TemplateNode'] as Model<TemplateNode> | undefined) ??
  model<TemplateNode>('TemplateNode', templateNodeSchema);
