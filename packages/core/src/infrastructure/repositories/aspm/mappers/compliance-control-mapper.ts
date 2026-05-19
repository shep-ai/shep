/**
 * ComplianceControl Database Mapper
 *
 * Feature 098, phase 9 / task-52. Translates between the
 * ComplianceControl domain type and SQLite rows in compliance_controls
 * (migration 115).
 */

import type {
  ComplianceControl,
  ComplianceFramework,
} from '../../../../domain/generated/output.js';

export interface ComplianceControlRow {
  id: string;
  framework_id: string;
  control_id: string;
  title: string;
  description: string;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
}

function toMillis(value: Date | number): number {
  return value instanceof Date ? value.getTime() : value;
}

export function toDatabase(control: ComplianceControl): ComplianceControlRow {
  return {
    id: control.id,
    framework_id: control.frameworkId,
    control_id: control.controlId,
    title: control.title,
    description: control.description,
    created_at: toMillis(control.createdAt),
    updated_at: toMillis(control.updatedAt),
    deleted_at: control.deletedAt ? toMillis(control.deletedAt) : null,
  };
}

export function fromDatabase(row: ComplianceControlRow): ComplianceControl {
  return {
    id: row.id,
    frameworkId: row.framework_id as ComplianceFramework,
    controlId: row.control_id,
    title: row.title,
    description: row.description,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    deletedAt: row.deleted_at !== null ? new Date(row.deleted_at) : undefined,
  };
}
