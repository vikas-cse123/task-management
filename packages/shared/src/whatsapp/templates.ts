import type { NotificationEventType } from '../enums/notification';

/**
 * Approved WhatsApp Cloud API template registry (Phase 5).
 *
 * Every automatic message must use an approved template — never free-form
 * text (Meta policy, and `docs/00-product-requirements.md` §9). This registry
 * is the single source of truth for template names, languages, and parameter
 * order. The order is part of the contract: Meta rejects a message whose
 * parameter count does not match the approved template.
 *
 * Time-sensitive parameters (dates, times, review periods) are allowed because
 * every template here is transactional, not marketing.
 */

export const WHATSAPP_TEMPLATE_KEYS = [
  'task_assigned',
  'task_reassigned',
  'task_ready',
  'task_revision_requested',
  'task_due_soon',
  'task_overdue',
  'task_escalation',
  'meeting_assigned',
  'meeting_rescheduled',
  'meeting_reminder',
  'campaign_review_due',
] as const;

export type WhatsAppTemplateKey = (typeof WHATSAPP_TEMPLATE_KEYS)[number];

/** Body parameter names used by the templates (and their in-app fallbacks). */
export const WHATSAPP_PARAMETERS = [
  'employee_name',
  'task_title',
  'project_name',
  'client_name',
  'due_date',
  'priority',
  'reason',
  'meeting_title',
  'meeting_time',
  'review_period',
  'url',
] as const;

export type WhatsAppParameter = (typeof WHATSAPP_PARAMETERS)[number];

/**
 * Parameters whose value legitimately changes with time. Everything else is a
 * stable business value. Used by the dispatch revalidation to detect a changed
 * deadline before sending a reminder.
 */
export const TIME_SENSITIVE_PARAMETERS: readonly WhatsAppParameter[] = [
  'due_date',
  'meeting_time',
  'review_period',
];

/** Meta's per-parameter ceiling for text parameters. */
export const MAX_TEMPLATE_PARAMETER_LENGTH = 1024;

/** Meta template-name rules: lowercase letters, digits and underscores. */
export const WHATSAPP_TEMPLATE_NAME_PATTERN = /^[a-z0-9_]{1,512}$/;

export interface WhatsAppTemplateDefinition {
  readonly key: WhatsAppTemplateKey;
  /** Approved Meta template name. */
  readonly name: string;
  /** Approved language code. */
  readonly language: string;
  /** Ordered body parameters (contractual). */
  readonly parameters: readonly WhatsAppParameter[];
  /** Human-readable in-app fallback built by `renderFallbackText`. */
  readonly fallback: string;
}

export const WHATSAPP_TEMPLATES: Record<WhatsAppTemplateKey, WhatsAppTemplateDefinition> = {
  task_assigned: {
    key: 'task_assigned',
    name: 'interscale_task_assigned',
    language: 'en',
    parameters: ['employee_name', 'task_title', 'project_name', 'due_date', 'url'],
    fallback:
      '{employee_name}, you have been assigned "{task_title}" on {project_name}. Due {due_date}. {url}',
  },
  task_reassigned: {
    key: 'task_reassigned',
    name: 'interscale_task_reassigned',
    language: 'en',
    parameters: ['employee_name', 'task_title', 'project_name', 'due_date', 'url'],
    fallback:
      '{employee_name}, "{task_title}" on {project_name} was reassigned to you. Due {due_date}. {url}',
  },
  task_ready: {
    key: 'task_ready',
    name: 'interscale_task_ready',
    language: 'en',
    parameters: ['employee_name', 'task_title', 'project_name', 'url'],
    fallback:
      '{employee_name}, your task "{task_title}" on {project_name} is now ready to start. {url}',
  },
  task_revision_requested: {
    key: 'task_revision_requested',
    name: 'interscale_task_revision_requested',
    language: 'en',
    parameters: ['employee_name', 'task_title', 'reason', 'url'],
    fallback: '{employee_name}, a revision was requested on "{task_title}": {reason}. {url}',
  },
  task_due_soon: {
    key: 'task_due_soon',
    name: 'interscale_task_due_soon',
    language: 'en',
    parameters: ['employee_name', 'task_title', 'due_date', 'url'],
    fallback: '{employee_name}, "{task_title}" is due soon: {due_date}. {url}',
  },
  task_overdue: {
    key: 'task_overdue',
    name: 'interscale_task_overdue',
    language: 'en',
    parameters: ['employee_name', 'task_title', 'due_date', 'url'],
    fallback: '{employee_name}, "{task_title}" is overdue. It was due {due_date}. {url}',
  },
  task_escalation: {
    key: 'task_escalation',
    name: 'interscale_task_escalation',
    language: 'en',
    parameters: ['employee_name', 'task_title', 'project_name', 'due_date', 'url'],
    fallback:
      '{employee_name}, an overdue task needs your attention: "{task_title}" on {project_name} was due {due_date}. {url}',
  },
  meeting_assigned: {
    key: 'meeting_assigned',
    name: 'interscale_meeting_assigned',
    language: 'en',
    parameters: ['employee_name', 'meeting_title', 'meeting_time', 'url'],
    fallback: '{employee_name}, you have a meeting "{meeting_title}" at {meeting_time}. {url}',
  },
  meeting_rescheduled: {
    key: 'meeting_rescheduled',
    name: 'interscale_meeting_rescheduled',
    language: 'en',
    parameters: ['employee_name', 'meeting_title', 'meeting_time', 'url'],
    fallback: '{employee_name}, "{meeting_title}" was rescheduled to {meeting_time}. {url}',
  },
  meeting_reminder: {
    key: 'meeting_reminder',
    name: 'interscale_meeting_reminder',
    language: 'en',
    parameters: ['employee_name', 'meeting_title', 'meeting_time', 'url'],
    fallback: '{employee_name}, reminder: "{meeting_title}" is at {meeting_time}. {url}',
  },
  campaign_review_due: {
    key: 'campaign_review_due',
    name: 'interscale_campaign_review_due',
    language: 'en',
    parameters: ['employee_name', 'project_name', 'review_period', 'url'],
    fallback:
      '{employee_name}, the weekly review for {project_name} is due for {review_period}. {url}',
  },
};

/** Map each automatic event to its approved template (contractual). */
export const NOTIFICATION_EVENT_TEMPLATE: Record<NotificationEventType, WhatsAppTemplateKey> = {
  'task.assigned': 'task_assigned',
  'task.reassigned': 'task_reassigned',
  'task.ready': 'task_ready',
  'task.revision_requested': 'task_revision_requested',
  'task.due_soon': 'task_due_soon',
  'task.overdue': 'task_overdue',
  'task.overdue_escalation': 'task_escalation',
  'meeting.assigned': 'meeting_assigned',
  'meeting.rescheduled': 'meeting_rescheduled',
  'meeting.reminder': 'meeting_reminder',
  'campaign.review_due': 'campaign_review_due',
};

export function getTemplateDefinition(key: WhatsAppTemplateKey): WhatsAppTemplateDefinition {
  return WHATSAPP_TEMPLATES[key];
}

/**
 * Normalize a parameter for the Cloud API.
 *
 * Meta rejects parameters containing newlines or tabs, and caps each at 1024
 * characters. Values are trimmed and whitespace-collapsed defensively; the
 * value itself is never truncated silently (an over-long value is a bug we
 * want to surface, not hide).
 */
export function normalizeTemplateParameter(value: string): string {
  const collapsed = value
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();

  if (collapsed.length > MAX_TEMPLATE_PARAMETER_LENGTH) {
    throw new RangeError(
      `Template parameter exceeds ${MAX_TEMPLATE_PARAMETER_LENGTH} characters after normalization`,
    );
  }

  return collapsed;
}

export interface TemplateParameterValues {
  readonly [name: string]: string;
}

/**
 * Build the ordered body parameters for a template definition.
 *
 * Throws when any required value is missing or empty, which is exactly the
 * condition that produces a Meta parameter-count / value error at send time.
 */
export function buildTemplateBodyParameters(
  definition: WhatsAppTemplateDefinition,
  values: TemplateParameterValues,
): { readonly type: 'text'; readonly text: string }[] {
  return definition.parameters.map((name) => {
    const raw = values[name];
    const value = typeof raw === 'string' ? raw.trim() : '';

    if (value.length === 0) {
      throw new RangeError(`Missing required template parameter "${name}"`);
    }

    return { type: 'text', text: normalizeTemplateParameter(value) };
  });
}

export interface WhatsAppTemplateMessage {
  readonly messaging_product: 'whatsapp';
  readonly recipient_type: 'individual';
  readonly to: string;
  readonly type: 'template';
  readonly template: {
    readonly name: string;
    readonly language: { readonly code: string };
    readonly components: {
      readonly type: 'body';
      readonly parameters: { readonly type: 'text'; readonly text: string }[];
    }[];
  };
}

export function buildTemplateMessage(
  to: string,
  definition: WhatsAppTemplateDefinition,
  values: TemplateParameterValues,
): WhatsAppTemplateMessage {
  return {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'template',
    template: {
      name: definition.name,
      language: { code: definition.language },
      components: [{ type: 'body', parameters: buildTemplateBodyParameters(definition, values) }],
    },
  };
}

/** Render the in-app fallback text for the same parameter values. */
export function renderFallbackText(
  definition: WhatsAppTemplateDefinition,
  values: TemplateParameterValues,
): string {
  return definition.fallback.replace(/\{(\w+)\}/g, (_match, name: string) => {
    const value = values[name];
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : '';
  });
}

/**
 * Registry self-check used by tests and startup validation.
 *
 * Returns a list of human-readable problems; an empty list means valid.
 */
export function validateTemplateRegistry(): string[] {
  const problems: string[] = [];

  for (const key of WHATSAPP_TEMPLATE_KEYS) {
    const definition = WHATSAPP_TEMPLATES[key];

    if (definition.key !== key) {
      problems.push(`Template "${key}" key mismatch`);
    }

    if (!WHATSAPP_TEMPLATE_NAME_PATTERN.test(definition.name)) {
      problems.push(`Template "${key}" has an invalid Meta name "${definition.name}"`);
    }

    if (definition.parameters.length === 0) {
      problems.push(`Template "${key}" declares no parameters`);
    }

    const seen = new Set<string>();

    for (const parameter of definition.parameters) {
      if (seen.has(parameter)) {
        problems.push(`Template "${key}" declares parameter "${parameter}" more than once`);
      }

      seen.add(parameter);

      if (!definition.fallback.includes(`{${parameter}}`)) {
        problems.push(`Template "${key}" fallback is missing "{${parameter}}"`);
      }
    }
  }

  return problems;
}
