import 'reflect-metadata';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ManageSpacesUseCase } from '@/application/use-cases/spaces/manage-spaces.use-case.js';
import type { ProductLine, Space } from '@/domain/generated/output.js';
import {
  DEFAULT_SPACE,
  createMockProductLineRepository,
  createMockProjectMemoryRepository,
  createMockSpaceMembershipRepository,
  createMockSpaceRepository,
  type MockProductLineRepository,
  type MockProjectMemoryRepository,
  type MockSpaceMembershipRepository,
  type MockSpaceRepository,
} from '../../../../helpers/space-repositories.mock.js';

const T = new Date('2026-10-01T00:00:00Z');
const ACME: Space = {
  id: 'space-acme',
  name: 'Acme',
  slug: 'acme',
  isDefault: false,
  createdAt: T,
  updatedAt: T,
};
const PAYMENTS: ProductLine = {
  id: 'line-pay',
  spaceId: ACME.id,
  name: 'Payments',
  slug: 'payments',
  createdAt: T,
  updatedAt: T,
};

describe('ManageSpacesUseCase', () => {
  let spaces: MockSpaceRepository;
  let lines: MockProductLineRepository;
  let membership: MockSpaceMembershipRepository;
  let memory: MockProjectMemoryRepository;
  let useCase: ManageSpacesUseCase;

  beforeEach(() => {
    const byId: Record<string, Space> = { [ACME.id]: ACME, [DEFAULT_SPACE.id]: DEFAULT_SPACE };
    const bySlug: Record<string, Space> = { acme: ACME, default: DEFAULT_SPACE };
    spaces = createMockSpaceRepository({
      findById: vi.fn(async (id: string) => byId[id] ?? null),
      findBySlug: vi.fn(async (slug: string) => bySlug[slug] ?? null),
    });
    lines = createMockProductLineRepository({
      findById: vi.fn(async (id: string) => (id === PAYMENTS.id ? PAYMENTS : null)),
      findBySlug: vi.fn(async (spaceId: string, slug: string) =>
        spaceId === ACME.id && slug === 'payments' ? PAYMENTS : null
      ),
    });
    membership = createMockSpaceMembershipRepository();
    memory = createMockProjectMemoryRepository();
    useCase = new ManageSpacesUseCase(spaces, lines, membership, memory);
  });

  describe('create()', () => {
    it('creates a space with a slug derived from its name', async () => {
      const result = await useCase.create({ name: '  Side Projects  ', description: 'Mine' });
      expect(result.ok).toBe(true);
      expect(spaces.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Side Projects',
          slug: 'side-projects',
          description: 'Mine',
          isDefault: false,
        })
      );
    });

    it('makes the new space the default when asked', async () => {
      const result = await useCase.create({ name: 'Personal', makeDefault: true });
      expect(result.ok).toBe(true);
      if (result.ok) expect(spaces.setDefault).toHaveBeenCalledWith(result.space.id);
    });

    it('refuses a name whose slug is taken', async () => {
      const result = await useCase.create({ name: 'ACME' });
      expect(result).toEqual({ ok: false, error: 'A space with the slug "acme" already exists.' });
      expect(spaces.create).not.toHaveBeenCalled();
    });

    it('refuses a name with no letters or digits', async () => {
      const result = await useCase.create({ name: '!!!' });
      expect(result.ok).toBe(false);
    });

    it('refuses a colour that is not a hex value', async () => {
      const result = await useCase.create({ name: 'Blue', color: 'blue' });
      expect(result.ok).toBe(false);
    });
  });

  describe('update()', () => {
    it('renames a space by slug and re-derives the slug', async () => {
      const result = await useCase.update('acme', { name: 'Acme Corp' });
      expect(result.ok).toBe(true);
      expect(spaces.update).toHaveBeenCalledWith(
        expect.objectContaining({ id: ACME.id, name: 'Acme Corp', slug: 'acme-corp' })
      );
    });

    it('reports an unknown space', async () => {
      const result = await useCase.update('nope', { name: 'X' });
      expect(result).toEqual({ ok: false, error: 'No space "nope".' });
    });
  });

  describe('setDefault()', () => {
    it('moves the default flag', async () => {
      const result = await useCase.setDefault('acme');
      expect(result.ok).toBe(true);
      expect(spaces.setDefault).toHaveBeenCalledWith(ACME.id);
    });
  });

  describe('delete()', () => {
    it('refuses to delete the default space', async () => {
      const result = await useCase.delete('default');
      expect(result.ok).toBe(false);
      expect(spaces.delete).not.toHaveBeenCalled();
    });

    it('refuses to delete a space that still holds memory', async () => {
      memory.countBySpace.mockResolvedValue(3);
      const result = await useCase.delete('acme');
      expect(result).toEqual({
        ok: false,
        error: 'Acme still holds 3 memory entries. Delete or move them first.',
      });
    });

    it('deletes the space with its rules, assignments and product lines', async () => {
      const result = await useCase.delete('acme');
      expect(result.ok).toBe(true);
      expect(membership.deleteRulesForSpace).toHaveBeenCalledWith(ACME.id);
      expect(membership.deleteAssignmentsForSpace).toHaveBeenCalledWith(ACME.id);
      expect(lines.deleteBySpace).toHaveBeenCalledWith(ACME.id);
      expect(spaces.delete).toHaveBeenCalledWith(ACME.id);
    });
  });

  describe('product lines', () => {
    it('creates a line inside a space', async () => {
      const result = await useCase.createProductLine('acme', { name: 'Mobile' });
      expect(result.ok).toBe(true);
      expect(lines.create).toHaveBeenCalledWith(
        expect.objectContaining({ spaceId: ACME.id, name: 'Mobile', slug: 'mobile' })
      );
    });

    it('refuses a duplicate line slug in the same space', async () => {
      const result = await useCase.createProductLine('acme', { name: 'Payments' });
      expect(result.ok).toBe(false);
    });

    it('renames a line', async () => {
      const result = await useCase.updateProductLine('acme', 'payments', {
        name: 'Payments Platform',
      });
      expect(result.ok).toBe(true);
      expect(lines.update).toHaveBeenCalledWith(
        expect.objectContaining({
          id: PAYMENTS.id,
          name: 'Payments Platform',
          slug: 'payments-platform',
        })
      );
    });

    it('refuses to delete a line that still has shared memory', async () => {
      memory.listProductLine.mockResolvedValue([{ id: 'm' }]);
      const result = await useCase.deleteProductLine('acme', 'payments');
      expect(result.ok).toBe(false);
      expect(lines.delete).not.toHaveBeenCalled();
    });

    it('deletes a line and detaches it from rules and assignments', async () => {
      const result = await useCase.deleteProductLine('acme', 'payments');
      expect(result.ok).toBe(true);
      expect(membership.clearProductLine).toHaveBeenCalledWith(PAYMENTS.id);
      expect(lines.delete).toHaveBeenCalledWith(PAYMENTS.id);
    });
  });
});
