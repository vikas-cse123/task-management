import { getDashboardSummary } from '@interscale/db';
import type { DashboardSummary, UserProfile } from '@interscale/shared';

/** Role-scoped dashboard aggregates (Step 11). */
export interface DashboardService {
  getSummary(actor: UserProfile): Promise<DashboardSummary>;
}

export function createDashboardService(): DashboardService {
  return {
    async getSummary(actor) {
      return getDashboardSummary(actor.id, actor.accessLevel);
    },
  };
}
