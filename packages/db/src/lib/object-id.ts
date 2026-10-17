import { isValidObjectId } from '@interscale/shared';
import { ValidationError } from './errors';

/**
 * Assert that a value is a valid ObjectId string.
 *
 * Guards service boundaries so invalid identifiers produce a clear
 * validation error instead of a Mongoose cast failure or an unauthorized
 * lookup.
 */
export function assertObjectId(value: unknown, label: string): string {
  if (!isValidObjectId(value)) {
    throw new ValidationError(`A valid ${label} identifier is required`);
  }

  return value;
}
