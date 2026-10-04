/**
 * Product Line Repository Interface (Output Port) — spec 120.
 *
 * Persistence for product lines: groups of related repositories inside one
 * space. Slugs are unique within their space.
 */

import type { ProductLine } from '../../../../domain/generated/output.js';

export interface IProductLineRepository {
  /** Every product line, by space then name. */
  listAll(): Promise<ProductLine[]>;

  /** The product lines of one space, by name. */
  listBySpace(spaceId: string): Promise<ProductLine[]>;

  findById(id: string): Promise<ProductLine | null>;

  findBySlug(spaceId: string, slug: string): Promise<ProductLine | null>;

  create(line: ProductLine): Promise<void>;

  /** Update name, slug, description and updatedAt. */
  update(line: ProductLine): Promise<void>;

  delete(id: string): Promise<void>;

  deleteBySpace(spaceId: string): Promise<void>;
}
