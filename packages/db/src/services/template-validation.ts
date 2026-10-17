import {
  DEADLINE_ANCHORS,
  JOB_ROLE_KEYS,
  TASK_PRIORITIES,
  TEMPLATE_APPROVER_RULES,
  TEMPLATE_ASSIGNMENT_RULES,
  TEMPLATE_TYPES,
  TEMPLATE_VARIABLE_KEYS,
  type TemplateDependencyInput,
  type TemplateNodeInput,
  type TemplateType,
  type TemplateValidationIssue,
} from '@interscale/shared';
import { TEMPLATE_VARIABLE_PATTERN } from './template-variables';

/** Editable content of one template version (validated and expanded purely). */
export interface TemplateDefinition {
  readonly nodes: readonly TemplateNodeInput[];
  readonly dependencies: readonly TemplateDependencyInput[];
}

function issue(
  path: string,
  message: string,
  nodeKey: string | null = null,
): TemplateValidationIssue {
  return { path, message, nodeKey };
}

/** Placeholder keys appearing in a template string (`{{name}}`). */
export function extractTemplateVariables(text: string | null | undefined): string[] {
  if (!text) {
    return [];
  }

  const found = new Set<string>();
  const pattern = new RegExp(TEMPLATE_VARIABLE_PATTERN.source, 'g');
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    if (match[1]) {
      found.add(match[1]);
    }
  }

  return [...found];
}

/**
 * Validate an editable template definition (Phase 4, Step 19.9).
 *
 * Pure and synchronous: callers run it before publishing (and before preview /
 * creation) so invalid graphs can never be persisted as a published version.
 * Returns every issue rather than throwing, so the editor can display them.
 */
export function validateTemplateDefinition(
  definition: TemplateDefinition,
  header: { name?: string; type?: string } = {},
  options: { requireContent?: boolean } = {},
): TemplateValidationIssue[] {
  const issues: TemplateValidationIssue[] = [];
  const { nodes, dependencies } = definition;
  const requireContent = options.requireContent ?? true;

  if (requireContent && header.name !== undefined && header.name.trim().length === 0) {
    issues.push(issue('name', 'A template name is required'));
  }

  if (
    requireContent &&
    header.type !== undefined &&
    !TEMPLATE_TYPES.includes(header.type as TemplateType)
  ) {
    issues.push(issue('type', 'A valid template type is required'));
  }

  if (requireContent && nodes.length === 0) {
    issues.push(issue('nodes', 'A template must define at least one task'));
  }

  const byKey = new Map<string, TemplateNodeInput>();

  nodes.forEach((node, index) => {
    const path = `nodes[${index}]`;

    if (byKey.has(node.nodeKey)) {
      issues.push(issue(`${path}.nodeKey`, `Duplicate node key "${node.nodeKey}"`, node.nodeKey));
    } else {
      byKey.set(node.nodeKey, node);
    }

    if (node.requiredJobRoleKey !== null && !JOB_ROLE_KEYS.includes(node.requiredJobRoleKey)) {
      issues.push(issue(`${path}.requiredJobRoleKey`, 'Unknown functional job role', node.nodeKey));
    }

    if (!TASK_PRIORITIES.includes(node.priority)) {
      issues.push(issue(`${path}.priority`, 'Unknown task priority', node.nodeKey));
    }

    if (
      node.approverResolutionRule !== null &&
      !TEMPLATE_APPROVER_RULES.includes(node.approverResolutionRule)
    ) {
      issues.push(issue(`${path}.approverResolutionRule`, 'Unknown approver rule', node.nodeKey));
    }

    if (!TEMPLATE_ASSIGNMENT_RULES.includes(node.assignmentRule)) {
      issues.push(issue(`${path}.assignmentRule`, 'Unknown assignment rule', node.nodeKey));
    }

    if (requireContent && node.approvalRequired && node.approverResolutionRule === 'none') {
      issues.push(
        issue(
          `${path}.approverResolutionRule`,
          'Approval is required but no approver rule is configured',
          node.nodeKey,
        ),
      );
    }

    if (requireContent && !node.approvalRequired && node.approverResolutionRule !== 'none') {
      issues.push(
        issue(
          `${path}.approvalRequired`,
          'An approver rule is configured but approval is not required',
          node.nodeKey,
        ),
      );
    }

    if (node.relativeDueRule) {
      const rule = node.relativeDueRule;

      if (!DEADLINE_ANCHORS.includes(rule.anchor)) {
        issues.push(
          issue(`${path}.relativeDueRule.anchor`, 'Unknown deadline anchor', node.nodeKey),
        );
      }

      if (!Number.isInteger(rule.offsetDays) || rule.offsetDays < 0) {
        issues.push(
          issue(
            `${path}.relativeDueRule.offsetDays`,
            'A non-negative whole-day offset is required',
            node.nodeKey,
          ),
        );
      }
    }

    for (const text of [node.titleTemplate, node.descriptionTemplate]) {
      for (const variable of extractTemplateVariables(text)) {
        if (!(TEMPLATE_VARIABLE_KEYS as readonly string[]).includes(variable)) {
          issues.push(
            issue(
              `${path}.titleTemplate`,
              `Unknown template variable "{{${variable}}}"`,
              node.nodeKey,
            ),
          );
        } else if (variable === 'adIndex' && node.repeatGroup === null) {
          issues.push(
            issue(
              `${path}.titleTemplate`,
              '"{{adIndex}}" may only be used inside a repeated creative group',
              node.nodeKey,
            ),
          );
        }
      }
    }
  });

  // Parent/child structure: exactly one level, parents repeat-consistent.
  for (const node of nodes) {
    if (node.parentNodeKey === null) {
      continue;
    }

    const parent = byKey.get(node.parentNodeKey);

    if (!parent) {
      issues.push(
        issue('nodes', `Parent node "${node.parentNodeKey}" does not exist`, node.nodeKey),
      );
      continue;
    }

    if (parent.nodeKey === node.nodeKey) {
      issues.push(issue('nodes', 'A node cannot be its own parent', node.nodeKey));
    }

    if (parent.parentNodeKey !== null) {
      issues.push(issue('nodes', 'Subtasks may only be nested one level deep', node.nodeKey));
    }

    if (parent.repeatGroup !== null && parent.repeatGroup !== node.repeatGroup) {
      issues.push(
        issue(
          'nodes',
          'A subtask of a repeated parent must belong to the same repeat group',
          node.nodeKey,
        ),
      );
    }
  }

  // Dependencies: existence, self, duplicates, parent-child, cycles.
  const edgeKeys = new Set<string>();
  const prerequisites = new Map<string, string[]>();

  dependencies.forEach((edge, index) => {
    const path = `dependencies[${index}]`;

    if (edge.predecessorNodeKey === edge.successorNodeKey) {
      issues.push(issue(path, 'A node cannot depend on itself', edge.predecessorNodeKey));
      return;
    }

    if (!byKey.has(edge.predecessorNodeKey)) {
      issues.push(issue(path, `Unknown prerequisite node "${edge.predecessorNodeKey}"`));
    }

    if (!byKey.has(edge.successorNodeKey)) {
      issues.push(issue(path, `Unknown successor node "${edge.successorNodeKey}"`));
    }

    const edgeKey = `${edge.predecessorNodeKey}->${edge.successorNodeKey}`;

    if (edgeKeys.has(edgeKey)) {
      issues.push(issue(path, 'Duplicate dependency edge', edge.successorNodeKey));
      return;
    }

    edgeKeys.add(edgeKey);

    const successor = byKey.get(edge.successorNodeKey);

    if (successor && successor.parentNodeKey === edge.predecessorNodeKey) {
      issues.push(issue(path, 'A subtask cannot depend on its own parent', edge.successorNodeKey));
    }

    const list = prerequisites.get(edge.successorNodeKey) ?? [];
    list.push(edge.predecessorNodeKey);
    prerequisites.set(edge.successorNodeKey, list);
  });

  if (hasCycle(prerequisites)) {
    issues.push(issue('dependencies', 'The prerequisites contain a circular workflow'));
  }

  return issues;
}

/** Depth-first cycle detection over the predecessor adjacency. */
function hasCycle(prerequisites: Map<string, string[]>): boolean {
  const visiting = new Set<string>();
  const visited = new Set<string>();

  function visit(node: string): boolean {
    if (visiting.has(node)) {
      return true;
    }

    if (visited.has(node)) {
      return false;
    }

    visiting.add(node);

    for (const next of prerequisites.get(node) ?? []) {
      if (visit(next)) {
        return true;
      }
    }

    visiting.delete(node);
    visited.add(node);

    return false;
  }

  for (const node of prerequisites.keys()) {
    if (visit(node)) {
      return true;
    }
  }

  return false;
}
