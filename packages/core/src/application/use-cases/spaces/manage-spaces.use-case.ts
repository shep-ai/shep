/**
 * ManageSpacesUseCase (spec 120)
 *
 * Create, rename, re-default and delete spaces and their product lines.
 * Presentation-agnostic: every method takes ids or slugs and returns a result
 * object the CLI, TUI and web can show as-is.
 *
 * Deleting never loses knowledge silently: a space or product line that still
 * holds shared memory is refused with a count, and the default space cannot be
 * deleted at all.
 */

import { injectable, inject } from 'tsyringe';
import { randomUUID } from 'node:crypto';
import type { ProductLine, Space } from '../../../domain/generated/output.js';
import type { ISpaceRepository } from '../../ports/output/repositories/space-repository.interface.js';
import type { IProductLineRepository } from '../../ports/output/repositories/product-line-repository.interface.js';
import type { ISpaceMembershipRepository } from '../../ports/output/repositories/space-membership-repository.interface.js';
import type { IProjectMemoryRepository } from '../../ports/output/repositories/project-memory-repository.interface.js';
import {
  failure,
  findProductLine,
  findSpace,
  isHexColor,
  spaceSlug,
  type SpaceResult,
} from './space-refs.js';

export interface CreateSpaceInput {
  name: string;
  description?: string;
  color?: string;
  makeDefault?: boolean;
}

export interface UpdateSpaceInput {
  name?: string;
  description?: string;
  color?: string;
}

export interface ProductLineInput {
  name: string;
  description?: string;
}

function trimmedOrUndefined(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed === '' ? undefined : trimmed;
}

@injectable()
export class ManageSpacesUseCase {
  constructor(
    @inject('ISpaceRepository') private readonly spaces: ISpaceRepository,
    @inject('IProductLineRepository') private readonly productLines: IProductLineRepository,
    @inject('ISpaceMembershipRepository') private readonly membership: ISpaceMembershipRepository,
    @inject('IProjectMemoryRepository') private readonly memory: IProjectMemoryRepository
  ) {}

  async list(): Promise<Space[]> {
    return this.spaces.list();
  }

  async create(input: CreateSpaceInput): Promise<SpaceResult<{ space: Space }>> {
    const name = input.name?.trim() ?? '';
    const slug = spaceSlug(name);
    if (!slug) return failure('A space name needs at least one letter or digit.');
    const color = trimmedOrUndefined(input.color);
    if (color && !isHexColor(color))
      return failure(`"${color}" is not a hex colour such as #3456c4.`);
    if (await this.spaces.findBySlug(slug)) {
      return failure(`A space with the slug "${slug}" already exists.`);
    }

    const now = new Date();
    const description = trimmedOrUndefined(input.description);
    const space: Space = {
      id: randomUUID(),
      name,
      slug,
      ...(description ? { description } : {}),
      ...(color ? { color } : {}),
      isDefault: false,
      createdAt: now,
      updatedAt: now,
    };
    await this.spaces.create(space);
    if (input.makeDefault) {
      await this.spaces.setDefault(space.id);
      return { ok: true, space: { ...space, isDefault: true } };
    }
    return { ok: true, space };
  }

  async update(ref: string, input: UpdateSpaceInput): Promise<SpaceResult<{ space: Space }>> {
    const existing = await findSpace(this.spaces, ref);
    if (!existing) return failure(`No space "${ref}".`);

    const name = input.name === undefined ? existing.name : input.name.trim();
    const slug = spaceSlug(name);
    if (!slug) return failure('A space name needs at least one letter or digit.');
    if (slug !== existing.slug) {
      const clash = await this.spaces.findBySlug(slug);
      if (clash && clash.id !== existing.id) {
        return failure(`A space with the slug "${slug}" already exists.`);
      }
    }
    const color = input.color === undefined ? existing.color : trimmedOrUndefined(input.color);
    if (color && !isHexColor(color))
      return failure(`"${color}" is not a hex colour such as #3456c4.`);
    const description =
      input.description === undefined
        ? existing.description
        : trimmedOrUndefined(input.description);

    const { description: _d, color: _c, ...rest } = existing;
    const space: Space = {
      ...rest,
      name,
      slug,
      ...(description ? { description } : {}),
      ...(color ? { color } : {}),
      updatedAt: new Date(),
    };
    await this.spaces.update(space);
    return { ok: true, space };
  }

  async setDefault(ref: string): Promise<SpaceResult<{ space: Space }>> {
    const space = await findSpace(this.spaces, ref);
    if (!space) return failure(`No space "${ref}".`);
    await this.spaces.setDefault(space.id);
    return { ok: true, space: { ...space, isDefault: true } };
  }

  async delete(ref: string): Promise<SpaceResult> {
    const space = await findSpace(this.spaces, ref);
    if (!space) return failure(`No space "${ref}".`);
    if (space.isDefault) {
      return failure(`${space.name} is the default space. Make another space the default first.`);
    }
    const memoryCount = await this.memory.countBySpace(space.id);
    if (memoryCount > 0) {
      return failure(
        `${space.name} still holds ${memoryCount} memory ${memoryCount === 1 ? 'entry' : 'entries'}. Delete or move them first.`
      );
    }

    await this.membership.deleteRulesForSpace(space.id);
    await this.membership.deleteAssignmentsForSpace(space.id);
    await this.productLines.deleteBySpace(space.id);
    await this.spaces.delete(space.id);
    return { ok: true };
  }

  async createProductLine(
    spaceRef: string,
    input: ProductLineInput
  ): Promise<SpaceResult<{ productLine: ProductLine }>> {
    const space = await findSpace(this.spaces, spaceRef);
    if (!space) return failure(`No space "${spaceRef}".`);
    const name = input.name?.trim() ?? '';
    const slug = spaceSlug(name);
    if (!slug) return failure('A product line name needs at least one letter or digit.');
    if (await this.productLines.findBySlug(space.id, slug)) {
      return failure(`${space.name} already has a product line "${slug}".`);
    }

    const now = new Date();
    const description = trimmedOrUndefined(input.description);
    const productLine: ProductLine = {
      id: randomUUID(),
      spaceId: space.id,
      name,
      slug,
      ...(description ? { description } : {}),
      createdAt: now,
      updatedAt: now,
    };
    await this.productLines.create(productLine);
    return { ok: true, productLine };
  }

  async updateProductLine(
    spaceRef: string,
    lineRef: string,
    input: Partial<ProductLineInput>
  ): Promise<SpaceResult<{ productLine: ProductLine }>> {
    const space = await findSpace(this.spaces, spaceRef);
    if (!space) return failure(`No space "${spaceRef}".`);
    const existing = await findProductLine(this.productLines, space, lineRef);
    if (!existing) return failure(`No product line "${lineRef}" in ${space.name}.`);

    const name = input.name === undefined ? existing.name : input.name.trim();
    const slug = spaceSlug(name);
    if (!slug) return failure('A product line name needs at least one letter or digit.');
    if (slug !== existing.slug) {
      const clash = await this.productLines.findBySlug(space.id, slug);
      if (clash && clash.id !== existing.id) {
        return failure(`${space.name} already has a product line "${slug}".`);
      }
    }
    const description =
      input.description === undefined
        ? existing.description
        : trimmedOrUndefined(input.description);
    const { description: _d, ...rest } = existing;
    const productLine: ProductLine = {
      ...rest,
      name,
      slug,
      ...(description ? { description } : {}),
      updatedAt: new Date(),
    };
    await this.productLines.update(productLine);
    return { ok: true, productLine };
  }

  async deleteProductLine(spaceRef: string, lineRef: string): Promise<SpaceResult> {
    const space = await findSpace(this.spaces, spaceRef);
    if (!space) return failure(`No space "${spaceRef}".`);
    const line = await findProductLine(this.productLines, space, lineRef);
    if (!line) return failure(`No product line "${lineRef}" in ${space.name}.`);

    const shared = await this.memory.listProductLine(line.id);
    if (shared.length > 0) {
      return failure(
        `${line.name} still shares ${shared.length} memory ${shared.length === 1 ? 'entry' : 'entries'}. Change their scope first.`
      );
    }

    await this.membership.clearProductLine(line.id);
    await this.productLines.delete(line.id);
    return { ok: true };
  }
}
