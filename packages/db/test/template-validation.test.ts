import type { TemplateDependencyInput, TemplateNodeInput } from '@interscale/shared';
import { describe, expect, it } from 'vitest';
import {
  extractTemplateVariables,
  validateTemplateDefinition,
} from '../src/services/template-validation';

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

function messages(
  nodes: TemplateNodeInput[],
  dependencies: TemplateDependencyInput[] = [],
  options: { requireContent?: boolean } = {},
): string {
  return validateTemplateDefinition(
    { nodes, dependencies },
    { name: 'Test', type: 'campaign' },
    options,
  )
    .map((entry) => entry.message)
    .join(' | ');
}

describe('template validation', () => {
  it('accepts a well-formed definition', () => {
    const issues = validateTemplateDefinition(
      {
        nodes: [
          node({
            nodeKey: 'brief',
            titleTemplate: 'Brief',
            requiredJobRoleKey: 'performance_marketer',
          }),
          node({
            nodeKey: 'script',
            titleTemplate: 'Write {{destination}} Script',
            requiredJobRoleKey: 'video_ad_script_writer',
            approvalRequired: true,
            approverResolutionRule: 'project_manager',
          }),
        ],
        dependencies: [{ predecessorNodeKey: 'brief', successorNodeKey: 'script' }],
      },
      { name: 'Campaign', type: 'campaign' },
    );

    expect(issues).toEqual([]);
  });

  it('requires content only when publishing', () => {
    expect(messages([], [], { requireContent: true })).toContain('at least one task');
    expect(messages([], [], { requireContent: false })).toBe('');
  });

  it('rejects duplicate node keys', () => {
    const result = messages(
      [
        node({ nodeKey: 'brief', titleTemplate: 'A' }),
        node({ nodeKey: 'brief', titleTemplate: 'B' }),
      ],
      [],
      { requireContent: false },
    );

    expect(result).toContain('Duplicate node key');
  });

  it('rejects unknown functional job roles', () => {
    const result = messages(
      [node({ nodeKey: 'brief', titleTemplate: 'A', requiredJobRoleKey: 'not_a_role' as never })],
      [],
      { requireContent: false },
    );

    expect(result).toContain('Unknown functional job role');
  });

  it('rejects unknown template variables', () => {
    const result = messages([node({ nodeKey: 'brief', titleTemplate: 'Hello {{planet}}' })], [], {
      requireContent: false,
    });

    expect(result).toContain('Unknown template variable');
  });

  it('resolves the destination variable in titles', () => {
    expect(extractTemplateVariables('Write {{destination}} Ad {{adIndex}}')).toEqual([
      'destination',
      'adIndex',
    ]);
  });

  it('rejects {{adIndex}} outside a repeat group', () => {
    const result = messages([node({ nodeKey: 'brief', titleTemplate: 'Ad {{adIndex}}' })], [], {
      requireContent: false,
    });

    expect(result).toContain('repeated creative group');
  });

  it('allows {{adIndex}} inside a repeat group', () => {
    const result = messages(
      [node({ nodeKey: 'video', titleTemplate: 'Ad {{adIndex}}', repeatGroup: 'video_ad' })],
      [],
      { requireContent: false },
    );

    expect(result).toBe('');
  });

  it('rejects circular dependencies', () => {
    const result = messages(
      [node({ nodeKey: 'a', titleTemplate: 'A' }), node({ nodeKey: 'b', titleTemplate: 'B' })],
      [
        { predecessorNodeKey: 'a', successorNodeKey: 'b' },
        { predecessorNodeKey: 'b', successorNodeKey: 'a' },
      ],
      { requireContent: false },
    );

    expect(result).toContain('circular workflow');
  });

  it('rejects a subtask depending on its own parent', () => {
    const result = messages(
      [
        node({ nodeKey: 'parent', titleTemplate: 'Parent' }),
        node({ nodeKey: 'child', parentNodeKey: 'parent', titleTemplate: 'Child' }),
      ],
      [{ predecessorNodeKey: 'parent', successorNodeKey: 'child' }],
      { requireContent: false },
    );

    expect(result).toContain('cannot depend on its own parent');
  });

  it('rejects deeper-than-one-level subtasks', () => {
    const result = messages(
      [
        node({ nodeKey: 'parent', titleTemplate: 'Parent' }),
        node({ nodeKey: 'child', parentNodeKey: 'parent', titleTemplate: 'Child' }),
        node({ nodeKey: 'grandchild', parentNodeKey: 'child', titleTemplate: 'Grandchild' }),
      ],
      [],
      { requireContent: false },
    );

    expect(result).toContain('one level deep');
  });

  it('rejects unknown parents, duplicate edges and self edges', () => {
    expect(
      messages([node({ nodeKey: 'child', parentNodeKey: 'missing', titleTemplate: 'C' })], [], {
        requireContent: false,
      }),
    ).toContain('does not exist');

    expect(
      messages(
        [node({ nodeKey: 'a', titleTemplate: 'A' }), node({ nodeKey: 'b', titleTemplate: 'B' })],
        [
          { predecessorNodeKey: 'a', successorNodeKey: 'b' },
          { predecessorNodeKey: 'a', successorNodeKey: 'b' },
        ],
        { requireContent: false },
      ),
    ).toContain('Duplicate dependency edge');

    expect(
      messages(
        [node({ nodeKey: 'a', titleTemplate: 'A' })],
        [{ predecessorNodeKey: 'a', successorNodeKey: 'a' }],
        {
          requireContent: false,
        },
      ),
    ).toContain('cannot depend on itself');
  });

  it('requires an approver rule when approval is required', () => {
    const result = messages(
      [node({ nodeKey: 'a', titleTemplate: 'A', approvalRequired: true })],
      [],
    );

    expect(result).toContain('no approver rule');
  });
});
