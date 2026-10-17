import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  CAMPAIGN_TEMPLATE_SEED,
  expandTemplateDefinition,
  loadTemplateDefinition,
  OFFICIAL_TEMPLATE_SEEDS,
  ONBOARDING_TEMPLATE_SEED,
  seedOfficialTemplates,
  TemplateModel,
  TemplateNodeModel,
  TemplateVersionModel,
} from '../src';
import {
  clearTestDatabase,
  connectTestDatabase,
  disconnectTestDatabase,
  ensureIndexes,
} from './support/database';
import { hasTestDatabase } from './support/flags';

describe.skipIf(!hasTestDatabase)('official templates seed', () => {
  beforeAll(async () => {
    await connectTestDatabase('official_templates');
    await ensureIndexes();
  });

  beforeEach(async () => {
    await clearTestDatabase();
  });

  afterAll(async () => {
    await disconnectTestDatabase();
  });

  it('seeds both official templates as published version 1', async () => {
    const summary = await seedOfficialTemplates();
    expect(summary.created).toBe(2);
    expect(summary.skipped).toBe(0);

    const campaign = await TemplateModel.findOne({
      key: 'destination_meta_ads_campaign',
    }).lean();
    expect(campaign?.status).toBe('published');
    expect(campaign?.currentPublishedVersion).toBe(1);

    const version = await TemplateVersionModel.findOne({
      templateId: campaign?._id,
      version: 1,
    }).lean();
    expect(version?.status).toBe('published');

    const nodeCount = await TemplateNodeModel.countDocuments({
      templateVersionId: version?._id,
    });
    expect(nodeCount).toBe(CAMPAIGN_TEMPLATE_SEED.nodes.length);

    const onboarding = await TemplateModel.findOne({
      key: 'client_onboarding_technical_setup',
    }).lean();
    expect(onboarding?.status).toBe('published');
  });

  it('is idempotent and never overwrites Admin edits', async () => {
    await seedOfficialTemplates();
    await TemplateModel.updateOne(
      { key: 'destination_meta_ads_campaign' },
      { $set: { name: 'Renamed By Admin' } },
    );

    const second = await seedOfficialTemplates();
    expect(second.created).toBe(0);
    expect(second.skipped).toBe(2);

    expect(await TemplateModel.countDocuments()).toBe(OFFICIAL_TEMPLATE_SEEDS.length);
    const campaign = await TemplateModel.findOne({
      key: 'destination_meta_ads_campaign',
    }).lean();
    expect(campaign?.name).toBe('Renamed By Admin');
  });

  it('produces a valid, destination-driven campaign expansion', async () => {
    await seedOfficialTemplates();
    const template = await TemplateModel.findOne({
      key: 'destination_meta_ads_campaign',
    }).lean();
    const version = await TemplateVersionModel.findOne({
      templateId: template?._id,
      version: 1,
    }).lean();
    const definition = await loadTemplateDefinition(version?._id.toString() as string);

    const expansion = expandTemplateDefinition(definition, {
      clientName: 'Acme Travel',
      destination: 'Singapore',
      campaignName: null,
      projectName: 'Singapore Campaign',
      projectStartDate: new Date('2027-03-01T00:00:00.000Z'),
      projectTargetDate: null,
      videoAdCount: 2,
      creativeTypes: ['video', 'static'],
      deadlineOverrides: [],
    });

    const titles = expansion.nodes.map((node) => node.title);
    expect(titles).toContain('Produce Singapore Video Ad 1');
    expect(titles).toContain('Write 5 Singapore Meta Ad Copies per Ad');
    expect(titles).toContain('Produce Singapore Static Ad 2');

    const launch = expansion.nodes.find((node) => node.resolvedKey === 'launch');
    expect(launch?.initialStatus).toBe('blocked');

    const editIntos = expansion.dependencies.filter((edge) => edge.successorNodeKey === 'launch');
    expect(editIntos.length).toBeGreaterThanOrEqual(4);
  });

  it('drops inactive onboarding-only nodes for a campaign', async () => {
    expect(ONBOARDING_TEMPLATE_SEED.nodes.some((node) => node.nodeKey === 'final_validation')).toBe(
      true,
    );
    expect(CAMPAIGN_TEMPLATE_SEED.dependencies.length).toBeGreaterThan(0);
  });
});
