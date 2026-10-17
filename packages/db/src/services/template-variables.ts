import { TEMPLATE_VARIABLE_KEYS } from '@interscale/shared';
import { ValidationError } from '../lib/errors';

/**
 * `{{variable}}` placeholder syntax.
 *
 * Deliberately limited to a fixed allow-list of identifiers: there is no
 * expression evaluation, no function calls and no `eval`, so a template can
 * never execute user-supplied code.
 */
export const TEMPLATE_VARIABLE_PATTERN = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/;

const ALLOWED = new Set<string>(TEMPLATE_VARIABLE_KEYS);

/** Replace known placeholders; throw on unknown or malformed ones. */
export function substituteVariables(text: string, resolve: (key: string) => string): string {
  const substituted = text.replace(
    new RegExp(TEMPLATE_VARIABLE_PATTERN.source, 'g'),
    (_match, key: string) => {
      if (!ALLOWED.has(key)) {
        throw new ValidationError(`Unknown template variable "{{${key}}}"`);
      }

      return resolve(key);
    },
  );

  if (/\{\{|\}\}/.test(substituted)) {
    throw new ValidationError('Malformed template variable placeholder');
  }

  return substituted.replace(/\s{2,}/g, ' ').trim();
}
