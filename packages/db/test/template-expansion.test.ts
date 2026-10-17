import type { TemplateDependencyInput, TemplateNodeInput } from '@interscale/shared';
import { describe, expect, it } from 'vitest';
import {
  expandTemplateDefinition,
  type TemplateExpansionContext,
} from '../src/services/template-expansion';

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

const campaignDefinition = {
  nodes: [
    node({ nodeKey: 'brief', titleTemplate: 'Campaign Brief & Competitor Research' }),
    node({
      nodeKey: 'video',
      titleTemplate: 'Produce {{destination}} Video Ad {{adIndex}}',
      repeatGroup: 'video_ad',
    }),
    node({
      nodeKey: 'script',
      parentNodeKey: 'video',
      titleTemplate: 'Write {{destination}} Video Ad {{adIndex}} Script',
      repeatGroup: 'video_ad',
      approvalRequired: true,
      approverResolutionRule: 'project_manager',
    }),
    node({
      nodeKey: 'edit',
      parentNodeKey: 'video',
      titleTemplate: 'Edit {{destination}} Video Ad {{adIndex}}',
      repeatGroup: 'video_ad',
      approvalRequired: true,
      approverResolutionRule: 'project_manager',
    }),
    node({ nodeKey: 'copies', titleTemplate: 'Write {{destination}} Meta Ad Copies' }),
    node({
      nodeKey: 'static',
      titleTemplate: 'Produce {{destination}} Static Ad {{adIndex}}',
      repeatGroup: 'static_ad',
      isRequired: false,
    }),
    node({ nodeKey: 'launch', titleTemplate: 'Launch {{destination}} Meta Campaign' }),
  ] satisfies TemplateNodeInput[],
  dependencies: [
    { predecessorNodeKey: 'brief', successorNodeKey: 'script' },
    { predecessorNodeKey: 'script', successorNodeKey: 'edit' },
    { predecessorNodeKey: 'brief', successorNodeKey: 'copies' },
    { predecessorNodeKey: 'edit', successorNodeKey: 'launch' },
    { predecessorNodeKey: 'copies', successorNodeKey: 'launch' },
    { predecessorNodeKey: 'brief', successorNodeKey: 'static' },
    { predecessorNodeKey: 'static', successorNodeKey: 'launch' },
  ] satisfies TemplateDependencyInput[],
};

function context(overrides: Partial<TemplateExpansionContext> = {}): TemplateExpansionContext {
  return {
    clientName: 'Acme Travel',
    destination: 'Singapore',
    campaignName: 'Singapore Summer',
    projectName: 'Singapore Summer Campaign',
    projectStartDate: new Date('2027-03-01T00:00:00.000Z'),
    projectTargetDate: new Date('2027-04-01T00:00:00.000Z'),
    videoAdCount: 1,
    creativeTypes: ['video'],
    deadlineOverrides: [],
    ...overrides,
  };
}

describe('template expansion', () => {
  it('expands repeated creative groups once per advertisement', () => {
    const result = expandTemplateDefinition(campaignDefinition, context({ videoAdCount: 3 }));

    const keys = result.nodes.map((entry) => entry.resolvedKey);
    expect(keys).toContain('video__1');
    expect(keys).toContain('video__3');
    expect(keys).toContain('script__2');
    expect(keys).toContain('edit__3');
    expect(new Set(keys).size).toBe(keys.length);

    expect(result.nodes.filter((entry) => entry.templateNodeKey === 'video')).toHaveLength(3);
    expect(result.nodes.filter((entry) => entry.templateNodeKey === 'script')).toHaveLength(3);
  });

  it('numbers {{adIndex}} only when there are multiple instances', () => {
    const many = expandTemplateDefinition(campaignDefinition, context({ videoAdCount: 3 }));
    const one = expandTemplateDefinition(campaignDefinition, context({ videoAdCount: 1 }));

    expect(many.nodes.find((entry) => entry.resolvedKey === 'video__2')?.title).toBe(
      'Produce Singapore Video Ad 2',
    );
    expect(one.nodes.find((entry) => entry.resolvedKey === 'video__1')?.title).toBe(
      'Produce Singapore Video Ad',
    );
    expect(one.warnings.some((entry) => entry.code === 'empty_variable')).toBe(false);
  });

  it('links repeated subtasks to their matching repeated parent', () => {
    const result = expandTemplateDefinition(campaignDefinition, context({ videoAdCount: 2 }));

    expect(result.nodes.find((entry) => entry.resolvedKey === 'script__2')?.parentResolvedKey).toBe(
      'video__2',
    );
  });

  it('omits creative groups that were not selected', () => {
    const result = expandTemplateDefinition(
      campaignDefinition,
      context({ creativeTypes: ['video'] }),
    );

    expect(result.nodes.some((entry) => entry.templateNodeKey === 'static')).toBe(false);
    expect(result.dependencies.some((edge) => edge.predecessorNodeKey.startsWith('static'))).toBe(
      false,
    );
  });

  it('includes optional creative groups when selected', () => {
    const result = expandTemplateDefinition(
      campaignDefinition,
      context({ creativeTypes: ['video', 'static'], videoAdCount: 2 }),
    );

    expect(result.nodes.some((entry) => entry.resolvedKey === 'static__1')).toBe(true);
    expect(result.nodes.some((entry) => entry.resolvedKey === 'static__2')).toBe(true);
  });

  it('fans dependencies out across repeated instances', () => {
    const result = expandTemplateDefinition(campaignDefinition, context({ videoAdCount: 3 }));

    const intoLaunch = result.dependencies
      .filter((edge) => edge.successorNodeKey === 'launch')
      .map((edge) => edge.predecessorNodeKey);

    expect(intoLaunch).toEqual(expect.arrayContaining(['edit__1', 'edit__2', 'edit__3', 'copies']));
  });

  it('derives initial statuses from prerequisites', () => {
    const result = expandTemplateDefinition(campaignDefinition, context({ videoAdCount: 3 }));
    const status = (key: string): string | undefined =>
      result.nodes.find((entry) => entry.resolvedKey === key)?.initialStatus;

    expect(status('brief')).toBe('todo');
    expect(status('video__1')).toBe('todo');
    expect(status('script__1')).toBe('blocked');
    expect(status('edit__1')).toBe('blocked');
    expect(status('copies')).toBe('blocked');
    expect(status('launch')).toBe('blocked');
  });

  it('calculates relative deadlines on the IST calendar', () => {
    const definition = {
      nodes: [
        node({
          nodeKey: 'brief',
          titleTemplate: 'Brief',
          relativeDueRule: { anchor: 'project_start', offsetDays: 5, timeOfDay: '09:00' },
        }),
      ],
      dependencies: [],
    };

    const result = expandTemplateDefinition(definition, context());
    expect(result.nodes[0]?.dueAt?.toISOString()).toBe('2027-03-06T03:30:00.000Z');
    expect(result.nodes[0]?.deadlineWarning).toBeNull();
  });

  it('warns instead of inventing a date when the anchor is missing', () => {
    const definition = {
      nodes: [
        node({
          nodeKey: 'brief',
          titleTemplate: 'Brief',
          relativeDueRule: { anchor: 'project_target', offsetDays: 2, timeOfDay: '09:00' },
        }),
      ],
      dependencies: [],
    };

    const result = expandTemplateDefinition(definition, context({ projectTargetDate: null }));
    expect(result.nodes[0]?.dueAt).toBeNull();
    expect(result.warnings.some((entry) => entry.code === 'missing_deadline_base')).toBe(true);
  });

  it('applies explicit deadline overrides', () => {
    const definition = {
      nodes: [node({ nodeKey: 'launch', titleTemplate: 'Launch' })],
      dependencies: [],
    };

    const result = expandTemplateDefinition(
      definition,
      context({ deadlineOverrides: [{ nodeKey: 'launch', dueAt: '2027-03-20T06:00:00.000Z' }] }),
    );

    expect(result.nodes[0]?.dueAt?.toISOString()).toBe('2027-03-20T06:00:00.000Z');
  });

  it('flags a subtask whose deadline runs past its parent', () => {
    const definition = {
      nodes: [
        node({
          nodeKey: 'video',
          titleTemplate: 'Video',
          relativeDueRule: { anchor: 'project_start', offsetDays: 3, timeOfDay: '09:00' },
        }),
        node({
          nodeKey: 'script',
          parentNodeKey: 'video',
          titleTemplate: 'Script',
          relativeDueRule: { anchor: 'project_start', offsetDays: 10, timeOfDay: '09:00' },
        }),
      ],
      dependencies: [],
    };

    const result = expandTemplateDefinition(definition, context());
    expect(result.warnings.some((entry) => entry.code === 'child_deadline_exceeds_parent')).toBe(
      true,
    );
  });
});
