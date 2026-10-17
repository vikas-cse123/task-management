/**
 * Client lifecycle status.
 *
 * Deliberately minimal for the MVP (`active` / `inactive`). The product
 * specification references a "client status" without enumerating the states, so
 * no additional business states are invented here. Extending this list is an
 * open decision recorded in docs/decisions.md.
 */
export const CLIENT_STATUSES = ['active', 'inactive'] as const;

export type ClientStatus = (typeof CLIENT_STATUSES)[number];

export const DEFAULT_CLIENT_STATUS: ClientStatus = 'active';
