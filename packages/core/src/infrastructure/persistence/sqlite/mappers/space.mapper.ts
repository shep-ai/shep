/**
 * Space Database Mappers (spec 120)
 *
 * Row <-> entity conversion for spaces, product lines, space rules and
 * repository space assignments. Dates are INTEGER unix milliseconds; optional
 * domain fields are nullable columns.
 */

import type {
  ProductLine,
  RepositorySpaceAssignment,
  Space,
  SpaceRule,
  SpaceRuleKind,
} from '../../../../domain/generated/output.js';
import { normalizeRepositoryPath } from '../../../../domain/shared/repository-path.js';

export interface SpaceRow {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  color: string | null;
  is_default: number;
  created_at: number;
  updated_at: number;
}

export interface ProductLineRow {
  id: string;
  space_id: string;
  name: string;
  slug: string;
  description: string | null;
  created_at: number;
  updated_at: number;
}

export interface SpaceRuleRow {
  id: string;
  space_id: string;
  product_line_id: string | null;
  kind: string;
  pattern: string;
  priority: number;
  created_at: number;
  updated_at: number;
}

export interface RepositorySpaceAssignmentRow {
  repository_path: string;
  space_id: string;
  product_line_id: string | null;
  created_at: number;
  updated_at: number;
}

function millis(value: Date | string | number): number {
  return value instanceof Date ? value.getTime() : new Date(value).getTime();
}

function withOptional<T extends object, K extends string>(
  entity: T,
  key: K,
  value: string | null
): T & Partial<Record<K, string>> {
  return value === null ? entity : { ...entity, [key]: value };
}

export function spaceToDatabase(space: Space): SpaceRow {
  return {
    id: space.id,
    name: space.name,
    slug: space.slug,
    description: space.description ?? null,
    color: space.color ?? null,
    is_default: space.isDefault ? 1 : 0,
    created_at: millis(space.createdAt),
    updated_at: millis(space.updatedAt),
  };
}

export function spaceFromDatabase(row: SpaceRow): Space {
  const base: Space = {
    id: row.id,
    name: row.name,
    slug: row.slug,
    isDefault: row.is_default === 1,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
  return withOptional(withOptional(base, 'description', row.description), 'color', row.color);
}

export function productLineToDatabase(line: ProductLine): ProductLineRow {
  return {
    id: line.id,
    space_id: line.spaceId,
    name: line.name,
    slug: line.slug,
    description: line.description ?? null,
    created_at: millis(line.createdAt),
    updated_at: millis(line.updatedAt),
  };
}

export function productLineFromDatabase(row: ProductLineRow): ProductLine {
  return withOptional(
    {
      id: row.id,
      spaceId: row.space_id,
      name: row.name,
      slug: row.slug,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    },
    'description',
    row.description
  );
}

export function spaceRuleToDatabase(rule: SpaceRule): SpaceRuleRow {
  return {
    id: rule.id,
    space_id: rule.spaceId,
    product_line_id: rule.productLineId ?? null,
    kind: rule.kind,
    pattern: rule.pattern,
    priority: rule.priority,
    created_at: millis(rule.createdAt),
    updated_at: millis(rule.updatedAt),
  };
}

export function spaceRuleFromDatabase(row: SpaceRuleRow): SpaceRule {
  return withOptional(
    {
      id: row.id,
      spaceId: row.space_id,
      kind: row.kind as SpaceRuleKind,
      pattern: row.pattern,
      priority: row.priority,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    },
    'productLineId',
    row.product_line_id
  );
}

export function assignmentToDatabase(
  assignment: RepositorySpaceAssignment
): RepositorySpaceAssignmentRow {
  return {
    repository_path: normalizeRepositoryPath(assignment.repositoryPath),
    space_id: assignment.spaceId,
    product_line_id: assignment.productLineId ?? null,
    created_at: millis(assignment.createdAt),
    updated_at: millis(assignment.updatedAt),
  };
}

export function assignmentFromDatabase(
  row: RepositorySpaceAssignmentRow
): RepositorySpaceAssignment {
  return withOptional(
    {
      repositoryPath: row.repository_path,
      spaceId: row.space_id,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    },
    'productLineId',
    row.product_line_id
  );
}
