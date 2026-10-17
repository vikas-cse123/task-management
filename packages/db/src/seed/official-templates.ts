import type { TemplateDependencyInput, TemplateNodeInput, TemplateType } from '@interscale/shared';
import { TemplateDependencyModel } from '../models/template-dependency';
import { TemplateNodeModel } from '../models/template-node';
import { TemplateVersionModel } from '../models/template-version';
import { TemplateModel } from '../models/template';
import { validateTemplateDefinition } from '../services/template-validation';

/**
 * Official Interscale Marketing templates (Phase 4, Steps 20–21).
 *
 * Seeded idempotently by stable `key`: if a template already exists it is never
 * touched, so an Admin's edits (or a newer published version) are always
 * preserved across re-seeding. Both definitions are validated before being
 * persisted, so the seeded set is always publishable.
 */

interface OfficialTemplateSeed {
  key: string;
  name: string;
  description: string;
  type: TemplateType;
  nodes: TemplateNodeInput[];
  dependencies: TemplateDependencyInput[];
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

/**
 * Destination Meta Ads Campaign Template (Step 20).
 *
 * Destination-agnostic: every title uses `{{destination}}`. Repeated creative
 * nodes (`video_ad`, `static_ad`, `carousel_ad`) expand once per selected
 * instance. Relative deadlines are intentionally omitted — no company turnaround
 * has been approved — so an Admin configures them explicitly.
 */
export const CAMPAIGN_TEMPLATE_SEED: OfficialTemplateSeed = {
  key: 'destination_meta_ads_campaign',
  name: 'Destination Meta Ads Campaign',
  description:
    'Reusable end-to-end campaign workflow for any destination (Singapore, Kashmir, Bali, Dubai, Vietnam, Goa).',
  type: 'campaign',
  nodes: [
    node({
      nodeKey: 'campaign_brief',
      titleTemplate: 'Campaign Brief & Competitor Research',
      descriptionTemplate:
        'Review the client offer and target destination, research competitor travel agency advertisements, review positioning, identify the traveller audience and creative direction, and prepare the campaign brief. This is the initial prerequisite for all downstream production.',
      requiredJobRoleKey: 'performance_marketer',
      priority: 'high',
      sortOrder: 10,
    }),
    node({
      nodeKey: 'video_ad',
      titleTemplate: 'Produce {{destination}} Video Ad {{adIndex}}',
      descriptionTemplate:
        'Coordination container for one video advertisement. Owned by the Project Manager as an authorized coordinator; production is carried out by the video script writer and video editor subtasks.',
      requiredJobRoleKey: 'project_manager',
      assignmentRule: 'project_manager',
      priority: 'high',
      repeatGroup: 'video_ad',
      sortOrder: 20,
    }),
    node({
      nodeKey: 'video_script',
      parentNodeKey: 'video_ad',
      titleTemplate: 'Write {{destination}} Video Ad {{adIndex}} Script',
      descriptionTemplate:
        'Write the video advertising script, submit it through the existing external review workflow, mark Submit for Approval in the app, and revise if requested.',
      requiredJobRoleKey: 'video_ad_script_writer',
      priority: 'high',
      approvalRequired: true,
      approverResolutionRule: 'project_manager',
      repeatGroup: 'video_ad',
      sortOrder: 21,
    }),
    node({
      nodeKey: 'video_edit',
      parentNodeKey: 'video_ad',
      titleTemplate: 'Edit {{destination}} Video Ad {{adIndex}}',
      descriptionTemplate:
        'Edit the advertising video, submit it through the existing external WhatsApp review process, mark Submit for Approval in the app, and revise if requested. Video files remain outside this software.',
      requiredJobRoleKey: 'video_editor',
      priority: 'high',
      approvalRequired: true,
      approverResolutionRule: 'project_manager',
      repeatGroup: 'video_ad',
      sortOrder: 22,
    }),
    node({
      nodeKey: 'meta_copies',
      titleTemplate: 'Write 5 {{destination}} Meta Ad Copies per Ad',
      descriptionTemplate:
        'Write five Meta ad copies for EACH advertisement in the campaign following the Interscale Marketing ad copywriting SOP. The opening sentence must address the right audience, the destination, and the destination-decided/high-intent traveller.',
      requiredJobRoleKey: 'performance_marketer',
      approvalRequired: true,
      approverResolutionRule: 'project_manager',
      sortOrder: 30,
    }),
    node({
      nodeKey: 'campaign_setup',
      titleTemplate: 'Campaign Setup, Flow Tracking & Dataset for {{destination}}',
      descriptionTemplate:
        'Prepare the campaign, configure the Meta advertising setup, configure Flow tracking, add and configure the correct dataset, verify tracking, and prepare required assets. May proceed in parallel with scriptwriting and ad copywriting.',
      requiredJobRoleKey: 'performance_marketer',
      sortOrder: 40,
    }),
    node({
      nodeKey: 'static_ad',
      titleTemplate: 'Produce {{destination}} Static Ad {{adIndex}}',
      descriptionTemplate:
        'Optional static creative. Only generated when the static creative option is selected.',
      requiredJobRoleKey: 'graphic_designer',
      approvalRequired: true,
      approverResolutionRule: 'project_manager',
      isRequired: false,
      repeatGroup: 'static_ad',
      sortOrder: 50,
    }),
    node({
      nodeKey: 'carousel_ad',
      titleTemplate: 'Produce {{destination}} Carousel Ad {{adIndex}}',
      descriptionTemplate:
        'Optional carousel creative. Only generated when the carousel creative option is selected.',
      requiredJobRoleKey: 'graphic_designer',
      approvalRequired: true,
      approverResolutionRule: 'project_manager',
      isRequired: false,
      repeatGroup: 'carousel_ad',
      sortOrder: 51,
    }),
    node({
      nodeKey: 'launch',
      titleTemplate: 'Launch {{destination}} Meta Campaign',
      descriptionTemplate:
        'Launch the destination Meta campaign. Remains blocked until every required prerequisite (approved video/creative assets, approved Meta copies and completed tracking setup) is Done.',
      requiredJobRoleKey: 'performance_marketer',
      priority: 'high',
      sortOrder: 60,
    }),
    node({
      nodeKey: 'weekly_review',
      titleTemplate: 'Weekly {{destination}} Campaign Review',
      descriptionTemplate:
        'Review ongoing campaign results, inspect lead quality, review cost per lead, identify necessary campaign adjustments and record performance actions. Intended to recur weekly once the campaign is Live; recurring scheduling is delivered in the notifications phase. It is created Blocked behind Launch and is not actionable before the campaign is live.',
      requiredJobRoleKey: 'performance_marketer',
      isRequired: false,
      sortOrder: 70,
    }),
  ],
  dependencies: [
    { predecessorNodeKey: 'campaign_brief', successorNodeKey: 'video_script' },
    { predecessorNodeKey: 'video_script', successorNodeKey: 'video_edit' },
    { predecessorNodeKey: 'campaign_brief', successorNodeKey: 'meta_copies' },
    { predecessorNodeKey: 'campaign_brief', successorNodeKey: 'campaign_setup' },
    { predecessorNodeKey: 'campaign_brief', successorNodeKey: 'static_ad' },
    { predecessorNodeKey: 'campaign_brief', successorNodeKey: 'carousel_ad' },
    { predecessorNodeKey: 'video_edit', successorNodeKey: 'launch' },
    { predecessorNodeKey: 'meta_copies', successorNodeKey: 'launch' },
    { predecessorNodeKey: 'campaign_setup', successorNodeKey: 'launch' },
    { predecessorNodeKey: 'static_ad', successorNodeKey: 'launch' },
    { predecessorNodeKey: 'carousel_ad', successorNodeKey: 'launch' },
    { predecessorNodeKey: 'launch', successorNodeKey: 'weekly_review' },
  ],
};

/**
 * Client Onboarding & Technical Setup Template (Step 21).
 *
 * Access readiness is confirmed manually by the Project Manager in the
 * "Collect Client Requirements, Assets & Access" task; downstream technical
 * setup depends on it rather than assuming access was granted. No credentials
 * are stored anywhere.
 */
export const ONBOARDING_TEMPLATE_SEED: OfficialTemplateSeed = {
  key: 'client_onboarding_technical_setup',
  name: 'Client Onboarding & Technical Setup',
  description:
    'Reusable onboarding workflow for a new travel agency client: requirements and access, business audit, WhatsApp and Meta setup, CRM personalization, master data and final handover.',
  type: 'onboarding',
  nodes: [
    node({
      nodeKey: 'collect_requirements',
      titleTemplate: 'Collect Client Requirements, Assets & Access',
      descriptionTemplate:
        'Gather client business information, collect branding assets, required social account access, Meta Ads permissions, WhatsApp Business access and Travel CRM information; confirm staff/contact details and record the access-readiness status. Do not store passwords, API secrets or private credentials here — record non-sensitive confirmation states or approved reference links only.',
      requiredJobRoleKey: 'project_manager',
      assignmentRule: 'project_manager',
      priority: 'high',
      sortOrder: 10,
    }),
    node({
      nodeKey: 'business_audit',
      titleTemplate: 'Audit Business Presence & Existing Advertising',
      descriptionTemplate:
        'Audit the website, Google Business Profile and social media presence; review existing advertisements; identify positioning and trust issues; perform relevant competitor research.',
      requiredJobRoleKey: 'performance_marketer',
      sortOrder: 20,
    }),
    node({
      nodeKey: 'whatsapp_setup',
      titleTemplate: 'WhatsApp Business Profile & WhatsApp Max Setup',
      descriptionTemplate:
        'Complete the WhatsApp Business profile, configure the WhatsApp Max workspace, configure the initial automation/qualification flow, review the business profile information and validate the initial configuration. Requires the WhatsApp access confirmed in the requirements task.',
      requiredJobRoleKey: 'performance_marketer',
      sortOrder: 30,
    }),
    node({
      nodeKey: 'meta_tracking',
      titleTemplate: 'Meta Tracking, Dataset & Custom Columns',
      descriptionTemplate:
        'Configure tracking and Flow tracking where applicable, set up the dataset, create Custom Columns named "Interscale Marketing" and validate the configuration. Requires the Meta Ads access confirmed in the requirements task.',
      requiredJobRoleKey: 'performance_marketer',
      sortOrder: 40,
    }),
    node({
      nodeKey: 'crm_personalization',
      titleTemplate: 'Personalize Travel Agency CRM',
      descriptionTemplate:
        'Configure the CRM for the client requirements, personalize the relevant settings and configure the necessary basic workflow data. Requires the CRM access and onboarding information from the requirements task.',
      requiredJobRoleKey: 'crm_data_executive',
      sortOrder: 50,
    }),
    node({
      nodeKey: 'master_data',
      titleTemplate: 'Enter Master Data, Packages & Itinerary Information',
      descriptionTemplate:
        'Enter the relevant master data, configure supplied packages, enter itinerary information and validate the required CRM records. Waits for CRM personalization.',
      requiredJobRoleKey: 'crm_data_executive',
      sortOrder: 60,
    }),
    node({
      nodeKey: 'final_validation',
      titleTemplate: 'Final Validation & Onboarding Handover',
      descriptionTemplate:
        'Review the implementation, confirm the required tasks, identify remaining blockers, record completion and prepare the handover for campaign launch. Waits for every required onboarding workstream.',
      requiredJobRoleKey: 'project_manager',
      assignmentRule: 'project_manager',
      priority: 'high',
      sortOrder: 70,
    }),
  ],
  dependencies: [
    { predecessorNodeKey: 'collect_requirements', successorNodeKey: 'business_audit' },
    { predecessorNodeKey: 'collect_requirements', successorNodeKey: 'whatsapp_setup' },
    { predecessorNodeKey: 'collect_requirements', successorNodeKey: 'meta_tracking' },
    { predecessorNodeKey: 'collect_requirements', successorNodeKey: 'crm_personalization' },
    { predecessorNodeKey: 'crm_personalization', successorNodeKey: 'master_data' },
    { predecessorNodeKey: 'business_audit', successorNodeKey: 'final_validation' },
    { predecessorNodeKey: 'whatsapp_setup', successorNodeKey: 'final_validation' },
    { predecessorNodeKey: 'meta_tracking', successorNodeKey: 'final_validation' },
    { predecessorNodeKey: 'crm_personalization', successorNodeKey: 'final_validation' },
    { predecessorNodeKey: 'master_data', successorNodeKey: 'final_validation' },
  ],
};

export const OFFICIAL_TEMPLATE_SEEDS: readonly OfficialTemplateSeed[] = [
  CAMPAIGN_TEMPLATE_SEED,
  ONBOARDING_TEMPLATE_SEED,
];

export interface OfficialTemplateSeedSummary {
  created: number;
  skipped: number;
  templateIds: Record<string, string>;
}

/**
 * Seed the official templates idempotently.
 *
 * A template is created and published (version 1) only when its stable `key`
 * does not already exist; existing templates — including Admin-modified ones —
 * are never overwritten. Safe to run repeatedly.
 */
export async function seedOfficialTemplates(): Promise<OfficialTemplateSeedSummary> {
  const summary: OfficialTemplateSeedSummary = { created: 0, skipped: 0, templateIds: {} };

  for (const seed of OFFICIAL_TEMPLATE_SEEDS) {
    const issues = validateTemplateDefinition(
      { nodes: seed.nodes, dependencies: seed.dependencies },
      { name: seed.name, type: seed.type },
    );

    if (issues.length > 0) {
      throw new Error(
        `Official template "${seed.key}" is invalid: ${issues.map((issue) => issue.message).join('; ')}`,
      );
    }

    const existing = await TemplateModel.findOne({ key: seed.key }).select({ _id: 1 }).lean();

    if (existing) {
      summary.skipped += 1;
      summary.templateIds[seed.key] = existing._id.toString();
      continue;
    }

    const [template] = await TemplateModel.create([
      {
        key: seed.key,
        name: seed.name,
        description: seed.description,
        type: seed.type,
        status: 'published',
        currentPublishedVersion: 1,
      },
    ]);

    if (!template) {
      throw new Error(`Failed to seed template "${seed.key}"`);
    }

    const [version] = await TemplateVersionModel.create([
      {
        templateId: template._id,
        version: 1,
        status: 'published',
        basedOnVersion: null,
        publishedAt: new Date(),
      },
    ]);

    if (!version) {
      throw new Error(`Failed to seed version 1 for "${seed.key}"`);
    }

    await TemplateNodeModel.insertMany(
      seed.nodes.map((entry) => ({
        templateId: template._id,
        templateVersionId: version._id,
        version: 1,
        ...entry,
      })),
    );

    if (seed.dependencies.length > 0) {
      await TemplateDependencyModel.insertMany(
        seed.dependencies.map((edge) => ({
          templateId: template._id,
          templateVersionId: version._id,
          version: 1,
          predecessorNodeKey: edge.predecessorNodeKey,
          successorNodeKey: edge.successorNodeKey,
        })),
      );
    }

    summary.created += 1;
    summary.templateIds[seed.key] = template._id.toString();
  }

  return summary;
}
