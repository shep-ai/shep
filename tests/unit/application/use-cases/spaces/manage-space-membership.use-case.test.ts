import 'reflect-metadata';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ManageSpaceMembershipUseCase } from '@/application/use-cases/spaces/manage-space-membership.use-case.js';
import { SpaceRuleKind, type ProductLine, type Space } from '@/domain/generated/output.js';
import {
  DEFAULT_SPACE,
  createMockProductLineRepository,
  createMockSpaceMembershipRepository,
  createMockSpaceRepository,
  type MockProductLineRepository,
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

describe('ManageSpaceMembershipUseCase', () => {
  let spaces: MockSpaceRepository;
  let lines: MockProductLineRepository;
  let membership: MockSpaceMembershipRepository;
  let useCase: ManageSpaceMembershipUseCase;

  beforeEach(() => {
    spaces = createMockSpaceRepository({
      findById: vi.fn(async (id: string) =>
        id === ACME.id ? ACME : id === DEFAULT_SPACE.id ? DEFAULT_SPACE : null
      ),
      findBySlug: vi.fn(async (slug: string) => (slug === 'acme' ? ACME : null)),
    });
    lines = createMockProductLineRepository({
      findBySlug: vi.fn(async (spaceId: string, slug: string) =>
        spaceId === ACME.id && slug === 'payments' ? PAYMENTS : null
      ),
    });
    membership = createMockSpaceMembershipRepository();
    useCase = new ManageSpaceMembershipUseCase(spaces, lines, membership);
  });

  describe('addRule()', () => {
    it('adds a normalised path rule', async () => {
      const result = await useCase.addRule({
        space: 'acme',
        kind: SpaceRuleKind.Path,
        pattern: 'C:\\Code\\Acme\\',
      });
      expect(result.ok).toBe(true);
      expect(membership.createRule).toHaveBeenCalledWith(
        expect.objectContaining({
          spaceId: ACME.id,
          kind: SpaceRuleKind.Path,
          pattern: 'c:/Code/Acme',
          priority: 100,
        })
      );
    });

    it('adds a remote rule with a product line and priority', async () => {
      const result = await useCase.addRule({
        space: 'acme',
        kind: SpaceRuleKind.Remote,
        pattern: 'https://github.com/Acme/payments-*',
        productLine: 'payments',
        priority: 10,
      });
      expect(result.ok).toBe(true);
      expect(membership.createRule).toHaveBeenCalledWith(
        expect.objectContaining({
          pattern: 'github.com/acme/payments-*',
          productLineId: PAYMENTS.id,
          priority: 10,
        })
      );
    });

    it('refuses a relative path pattern', async () => {
      const result = await useCase.addRule({
        space: 'acme',
        kind: SpaceRuleKind.Path,
        pattern: 'code/acme',
      });
      expect(result.ok).toBe(false);
    });

    it('refuses a remote pattern without an owner segment', async () => {
      const result = await useCase.addRule({
        space: 'acme',
        kind: SpaceRuleKind.Remote,
        pattern: 'github.com',
      });
      expect(result.ok).toBe(false);
    });

    it('refuses a product line from another space', async () => {
      const result = await useCase.addRule({
        space: DEFAULT_SPACE.id,
        kind: SpaceRuleKind.Path,
        pattern: '/code',
        productLine: 'payments',
      });
      expect(result).toEqual({ ok: false, error: 'No product line "payments" in Default.' });
    });

    it('refuses a duplicate rule', async () => {
      membership.listRules.mockResolvedValue([
        {
          id: 'r',
          spaceId: ACME.id,
          kind: SpaceRuleKind.Path,
          pattern: '/code/acme',
          priority: 100,
          createdAt: T,
          updatedAt: T,
        },
      ]);
      const result = await useCase.addRule({
        space: 'acme',
        kind: SpaceRuleKind.Path,
        pattern: '/code/acme/',
      });
      expect(result.ok).toBe(false);
    });
  });

  describe('removeRule()', () => {
    it('removes a known rule', async () => {
      membership.findRuleById.mockResolvedValue({ id: 'r1' });
      expect((await useCase.removeRule('r1')).ok).toBe(true);
      expect(membership.deleteRule).toHaveBeenCalledWith('r1');
    });

    it('reports an unknown rule', async () => {
      expect((await useCase.removeRule('r9')).ok).toBe(false);
    });
  });

  describe('assign() and unassign()', () => {
    it('assigns a normalised absolute path to a space and line', async () => {
      const result = await useCase.assign({
        repositoryPath: '/code/acme/api/',
        space: 'acme',
        productLine: 'payments',
      });
      expect(result.ok).toBe(true);
      expect(membership.upsertAssignment).toHaveBeenCalledWith(
        expect.objectContaining({
          repositoryPath: '/code/acme/api',
          spaceId: ACME.id,
          productLineId: PAYMENTS.id,
        })
      );
    });

    it('refuses a relative path', async () => {
      expect((await useCase.assign({ repositoryPath: 'api', space: 'acme' })).ok).toBe(false);
    });

    it('unassigns a path', async () => {
      membership.findAssignment.mockResolvedValue({ repositoryPath: '/x' });
      expect((await useCase.unassign('/x')).ok).toBe(true);
      expect(membership.deleteAssignment).toHaveBeenCalledWith('/x');
    });

    it('reports a path that was not assigned', async () => {
      expect((await useCase.unassign('/x')).ok).toBe(false);
    });
  });
});
