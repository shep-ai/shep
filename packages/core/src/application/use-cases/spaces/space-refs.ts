/**
 * Shared helpers for the space use cases (spec 120): look spaces and product
 * lines up by id or slug, derive slugs, and shape result objects.
 */

import type { ProductLine, Space } from '../../../domain/generated/output.js';
import { cleanDeployName } from '../../../domain/shared/clean-name.js';
import type { ISpaceRepository } from '../../ports/output/repositories/space-repository.interface.js';
import type { IProductLineRepository } from '../../ports/output/repositories/product-line-repository.interface.js';

export type SpaceResult<T extends object = object> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

export function failure(error: string): { ok: false; error: string } {
  return { ok: false, error };
}

/** Slug used for spaces and product lines: lower-case letters, digits and hyphens. */
export function spaceSlug(name: string): string {
  return cleanDeployName(name);
}

const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

export function isHexColor(value: string): boolean {
  return HEX_COLOR.test(value);
}

/** A space by id or slug. */
export async function findSpace(spaces: ISpaceRepository, ref: string): Promise<Space | null> {
  const key = ref.trim();
  if (!key) return null;
  return (await spaces.findById(key)) ?? (await spaces.findBySlug(key.toLowerCase()));
}

/** A product line of one space, by id or slug. Lines of other spaces never match. */
export async function findProductLine(
  productLines: IProductLineRepository,
  space: Space,
  ref: string
): Promise<ProductLine | null> {
  const key = ref.trim();
  if (!key) return null;
  const byId = await productLines.findById(key);
  if (byId && byId.spaceId === space.id) return byId;
  return productLines.findBySlug(space.id, key.toLowerCase());
}
