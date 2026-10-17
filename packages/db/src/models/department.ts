import { DEPARTMENT_KEYS, type DepartmentKey } from '@interscale/shared';
import mongoose from 'mongoose';
import type { HydratedDocument, Model } from 'mongoose';

const { Schema, model, models } = mongoose;

/**
 * Seeded organizational department reference data.
 *
 * `key` is a stable internal identifier and is immutable. Admins may edit the
 * display `name` and `description`; a referenced department must not be
 * deleted.
 */
export interface Department {
  key: DepartmentKey;
  name: string;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export type DepartmentDocument = HydratedDocument<Department>;

export const departmentSchema = new Schema<Department>(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      immutable: true,
      enum: [...DEPARTMENT_KEYS],
    },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    description: { type: String, trim: true, default: null, maxlength: 1000 },
  },
  { timestamps: true, versionKey: false },
);

export const DepartmentModel: Model<Department> =
  (models['Department'] as Model<Department> | undefined) ??
  model<Department>('Department', departmentSchema);
