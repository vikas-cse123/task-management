import { runDueCampaignReviews, type CampaignReviewRunSummary } from '@interscale/db';
import { logger } from '../lib/logger';

export const CAMPAIGN_REVIEW_JOB = 'notifications.campaignReview';

/** Generate every campaign-review period that is now due. */
export async function runCampaignReview(): Promise<CampaignReviewRunSummary> {
  const summary = await runDueCampaignReviews();

  if (summary.generated > 0) {
    logger.info(summary, 'Campaign review run completed');
  }

  return summary;
}
