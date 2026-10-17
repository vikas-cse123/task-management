import {
  type DeadlineOverride,
  type CreativeType,
  type JobRoleKey,
  type TaskPriority,
  type TaskStatus,
  type TemplateApproverRule,
  type TemplateAssignmentRule,
  type TemplateWarning,
} from '@interscale/shared';
import { addDaysAtIst, formatIstDate } from '../lib/deadlines';
import { substituteVariables } from './template-variables';
import type { TemplateDefinition } from './template-validation';

/**
 * Deterministic, pure template expansion (Phase 4, Steps 22.4, 22.12).
 *
 * The exact same function drives the preview and the final creation, so the two
 * can never drift. It resolves variables, expands repeated creative groups,
 * computes calendar-day deadlines and derives initial task statuses. No
 * database access happens here, so it can run (and be tested) independently of
 * a replica set.
 */

/** Repeat group implied by each selected creative type. */
export const CREATIVE_TYPE_TO_REPEAT_GROUP: Record<CreativeType, string> = {
  video: 'video_ad',
  static: 'static_ad',
  carousel: 'carousel_ad',
};

export interface TemplateExpansionContext {
  clientName: string;
  destination: string | null;
  campaignName: string | null;
  projectName: string;
  projectStartDate: Date | null;
  projectTargetDate: Date | null;
  videoAdCount: number;
  creativeTypes: readonly CreativeType[];
  deadlineOverrides: readonly DeadlineOverride[];
}

export interface ExpandedNode {
  resolvedKey: string;
  templateNodeKey: string;
  parentResolvedKey: string | null;
  repeatGroup: string | null;
  repeatIndex: number | null;
  title: string;
  description: string | null;
  requiredJobRoleKey: JobRoleKey | null;
  priority: TaskPriority;
  approvalRequired: boolean;
  approverResolutionRule: TemplateApproverRule;
  assignmentRule: TemplateAssignmentRule;
  dueAt: Date | null;
  isRequired: boolean;
  sopUrl: string | null;
  referenceUrl: string | null;
  sortOrder: number;
  initialStatus: TaskStatus;
  deadlineWarning: string | null;
}

export interface ExpandedDependency {
  predecessorNodeKey: string;
  successorNodeKey: string;
}

export interface ExpansionResult {
  nodes: ExpandedNode[];
  dependencies: ExpandedDependency[];
  warnings: TemplateWarning[];
}

function variableValue(
  key: string,
  context: TemplateExpansionContext,
  repeatIndex: number | null,
  instanceCount: number,
): string {
  switch (key) {
    case 'clientName':
      return context.clientName;
    case 'destination':
      return context.destination ?? '';
    case 'campaignName':
      return context.campaignName ?? context.projectName;
    case 'projectName':
      return context.projectName;
    case 'projectStartDate':
      return context.projectStartDate ? formatIstDate(context.projectStartDate) : '';
    case 'projectTargetDate':
      return context.projectTargetDate ? formatIstDate(context.projectTargetDate) : '';
    case 'adIndex':
      return repeatIndex !== null && instanceCount > 1 ? String(repeatIndex) : '';
    default:
      return '';
  }
}

export function expandTemplateDefinition(
  definition: TemplateDefinition,
  context: TemplateExpansionContext,
): ExpansionResult {
  const warnings: TemplateWarning[] = [];
  const activeGroups = new Set(
    context.creativeTypes.map((type) => CREATIVE_TYPE_TO_REPEAT_GROUP[type]),
  );

  const nodes = definition.nodes.filter(
    (node) => node.repeatGroup === null || activeGroups.has(node.repeatGroup),
  );

  const byTemplateKey = new Map(nodes.map((node) => [node.nodeKey, node] as const));
  const instanceCounts = new Map<string, number>();

  for (const node of nodes) {
    if (node.repeatGroup) {
      instanceCounts.set(node.repeatGroup, context.videoAdCount);
    }
  }

  const overrides = new Map(context.deadlineOverrides.map((entry) => [entry.nodeKey, entry.dueAt]));
  const keysByTemplateKey = new Map<string, string[]>();
  const expanded: ExpandedNode[] = [];

  for (const node of nodes) {
    const count = node.repeatGroup ? (instanceCounts.get(node.repeatGroup) ?? 1) : 1;
    const keys: string[] = [];

    for (let instance = 1; instance <= count; instance += 1) {
      const repeatIndex = node.repeatGroup ? instance : null;
      const resolvedKey = node.repeatGroup ? `${node.nodeKey}__${instance}` : node.nodeKey;
      keys.push(resolvedKey);

      const resolve = (key: string): string => {
        const value = variableValue(key, context, repeatIndex, count);

        if (value === '' && key !== 'adIndex') {
          warnings.push({
            code: 'empty_variable',
            message: `"{{${key}}}" resolved to an empty value for "${node.nodeKey}"`,
            nodeKey: node.nodeKey,
          });
        }

        return value;
      };

      const title = substituteVariables(node.titleTemplate, resolve);
      const description = node.descriptionTemplate
        ? substituteVariables(node.descriptionTemplate, resolve)
        : null;

      const parentResolvedKey =
        node.parentNodeKey === null
          ? null
          : node.repeatGroup !== null && byTemplateKey.get(node.parentNodeKey)?.repeatGroup
            ? `${node.parentNodeKey}__${instance}`
            : node.parentNodeKey;

      const { dueAt, deadlineWarning } = computeDeadline(
        node.relativeDueRule,
        context,
        overrideFor(overrides, resolvedKey, node.nodeKey),
        warnings,
        node.nodeKey,
      );

      expanded.push({
        resolvedKey,
        templateNodeKey: node.nodeKey,
        parentResolvedKey,
        repeatGroup: node.repeatGroup,
        repeatIndex,
        title,
        description,
        requiredJobRoleKey: node.requiredJobRoleKey,
        priority: node.priority,
        approvalRequired: node.approvalRequired,
        approverResolutionRule: node.approverResolutionRule,
        assignmentRule: node.assignmentRule,
        dueAt,
        isRequired: node.isRequired,
        sopUrl: node.sopUrl,
        referenceUrl: node.referenceUrl,
        sortOrder: node.sortOrder,
        initialStatus: 'todo',
        deadlineWarning,
      });
    }

    keysByTemplateKey.set(node.nodeKey, keys);
  }

  const dependencies = expandDependencies(definition, byTemplateKey, keysByTemplateKey);
  const predecessors = new Set(dependencies.map((edge) => edge.successorNodeKey));

  for (const node of expanded) {
    node.initialStatus = predecessors.has(node.resolvedKey) ? 'blocked' : 'todo';
  }

  addDeadlineConsistencyWarnings(expanded, warnings);

  return { nodes: expanded, dependencies, warnings };
}

function overrideFor(
  overrides: Map<string, string>,
  resolvedKey: string,
  templateNodeKey: string,
): string | undefined {
  return overrides.get(resolvedKey) ?? overrides.get(templateNodeKey);
}

function computeDeadline(
  rule: { anchor: string; offsetDays: number; timeOfDay: string } | null,
  context: TemplateExpansionContext,
  override: string | undefined,
  warnings: TemplateWarning[],
  nodeKey: string,
): { dueAt: Date | null; deadlineWarning: string | null } {
  if (override !== undefined) {
    const parsed = new Date(override);

    if (Number.isNaN(parsed.getTime())) {
      throw new Error(`Invalid deadline override for "${nodeKey}"`);
    }

    return { dueAt: parsed, deadlineWarning: null };
  }

  if (!rule) {
    return { dueAt: null, deadlineWarning: null };
  }

  const base =
    rule.anchor === 'project_target' ? context.projectTargetDate : context.projectStartDate;

  if (!base) {
    const message = `No ${rule.anchor === 'project_target' ? 'target' : 'start'} date to calculate "${nodeKey}" from`;
    warnings.push({ code: 'missing_deadline_base', message, nodeKey });

    return { dueAt: null, deadlineWarning: message };
  }

  const dueAt = addDaysAtIst(base, rule.offsetDays, rule.timeOfDay);

  if (dueAt.getTime() < Date.now() - 24 * 60 * 60 * 1000) {
    const message = `"${nodeKey}" calculates to a past-due date`;
    warnings.push({ code: 'past_due_deadline', message, nodeKey });

    return { dueAt, deadlineWarning: message };
  }

  return { dueAt, deadlineWarning: null };
}

function expandDependencies(
  definition: TemplateDefinition,
  byTemplateKey: Map<string, { repeatGroup: string | null }>,
  keysByTemplateKey: Map<string, string[]>,
): ExpandedDependency[] {
  const edges: ExpandedDependency[] = [];
  const seen = new Set<string>();

  const push = (predecessorNodeKey: string, successorNodeKey: string): void => {
    const key = `${predecessorNodeKey}->${successorNodeKey}`;

    if (!seen.has(key)) {
      seen.add(key);
      edges.push({ predecessorNodeKey, successorNodeKey });
    }
  };

  for (const edge of definition.dependencies) {
    const predecessorKeys = keysByTemplateKey.get(edge.predecessorNodeKey);
    const successorKeys = keysByTemplateKey.get(edge.successorNodeKey);

    if (!predecessorKeys || !successorKeys) {
      continue;
    }

    const predecessorRepeats = byTemplateKey.get(edge.predecessorNodeKey)?.repeatGroup !== null;
    const successorRepeats = byTemplateKey.get(edge.successorNodeKey)?.repeatGroup !== null;

    if (predecessorRepeats && successorRepeats) {
      const pairs = Math.min(predecessorKeys.length, successorKeys.length);

      for (let index = 0; index < pairs; index += 1) {
        push(predecessorKeys[index] as string, successorKeys[index] as string);
      }
    } else if (predecessorRepeats) {
      for (const predecessorKey of predecessorKeys) {
        push(predecessorKey, successorKeys[0] as string);
      }
    } else if (successorRepeats) {
      for (const successorKey of successorKeys) {
        push(predecessorKeys[0] as string, successorKey);
      }
    } else {
      push(predecessorKeys[0] as string, successorKeys[0] as string);
    }
  }

  return edges;
}

function addDeadlineConsistencyWarnings(nodes: ExpandedNode[], warnings: TemplateWarning[]): void {
  const byKey = new Map(nodes.map((node) => [node.resolvedKey, node] as const));

  for (const node of nodes) {
    if (!node.parentResolvedKey || !node.dueAt) {
      continue;
    }

    const parent = byKey.get(node.parentResolvedKey);

    if (parent?.dueAt && node.dueAt.getTime() > parent.dueAt.getTime()) {
      warnings.push({
        code: 'child_deadline_exceeds_parent',
        message: `"${node.title}" is due after its parent task`,
        nodeKey: node.templateNodeKey,
      });
    }
  }
}
