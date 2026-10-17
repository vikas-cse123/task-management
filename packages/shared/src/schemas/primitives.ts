import { z } from 'zod';

/** MongoDB ObjectId as a 24-character hexadecimal string. */
export const OBJECT_ID_PATTERN = /^[0-9a-fA-F]{24}$/;

export const objectIdSchema = z
  .string()
  .regex(OBJECT_ID_PATTERN, 'Must be a 24-character hexadecimal identifier');

/** Whether a value is a string that can be coerced into a MongoDB ObjectId. */
export function isValidObjectId(value: unknown): value is string {
  return typeof value === 'string' && OBJECT_ID_PATTERN.test(value);
}

/**
 * E.164 phone number, e.g. `+919876543210`.
 *
 * Used for WhatsApp-capable numbers. The number is stored in E.164 without
 * spaces or separators.
 */
export const E164_PATTERN = /^\+[1-9]\d{1,14}$/;

export const phoneE164Schema = z
  .string()
  .trim()
  .regex(E164_PATTERN, 'Must be an E.164 phone number, for example +919876543210');

export const emailSchema = z.string().trim().toLowerCase().email().max(254);

export const nonEmptyStringSchema = z.string().trim().min(1);

export const shortTextSchema = z.string().trim().min(1).max(160);

export const longTextSchema = z.string().trim().max(2000);
