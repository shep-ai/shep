/**
 * BootPromptResolver Unit Tests
 *
 * Covers the three-case branch that decides what the agent's first turn
 * will be:
 *
 * 1. pendingUserContent defined → it becomes the bootPrompt (user-initiated boot)
 * 2. No pending content AND no systemPromptOverride → feature context is the bootPrompt
 * 3. No pending content AND systemPromptOverride set → silent boot (bootPrompt = '')
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

import { BootPromptResolver } from '@/infrastructure/services/interactive/lifecycle/boot-prompt.resolver.js';
import type { IFeatureRepository } from '@/application/ports/output/repositories/feature-repository.interface.js';
import type { FeatureContextBuilder } from '@/infrastructure/services/interactive/feature-context.builder.js';

function makeFeatureRepo(pr?: { url: string }): IFeatureRepository {
  return {
    findById: vi
      .fn()
      .mockResolvedValue(
        pr !== undefined
          ? { id: 'feat-1', name: 'Test Feature', pr }
          : { id: 'feat-1', name: 'Test Feature' }
      ),
    create: vi.fn(),
    findByIdPrefix: vi.fn(),
    findBySlug: vi.fn(),
    findByBranch: vi.fn(),
    list: vi.fn(),
    update: vi.fn(),
    findByParentId: vi.fn(),
    delete: vi.fn(),
    softDelete: vi.fn(),
  } as unknown as IFeatureRepository;
}

function makeContextBuilder(result = 'built-context'): FeatureContextBuilder {
  return {
    buildContext: vi.fn().mockReturnValue(result),
  } as unknown as FeatureContextBuilder;
}

describe('BootPromptResolver', () => {
  let featureRepo: IFeatureRepository;
  let contextBuilder: FeatureContextBuilder;
  let resolver: BootPromptResolver;

  beforeEach(() => {
    featureRepo = makeFeatureRepo();
    contextBuilder = makeContextBuilder();
    resolver = new BootPromptResolver(featureRepo, contextBuilder);
  });

  // Case 1: pendingUserContent is defined
  describe('case 1 — pendingUserContent defined', () => {
    it('uses pendingUserContent as bootPrompt', async () => {
      const result = await resolver.resolve('feat-1', '/wt', 'user msg', undefined);
      expect(result.bootPrompt).toBe('user msg');
    });

    it('builds feature context when no systemPromptOverride', async () => {
      await resolver.resolve('feat-1', '/wt', 'user msg', undefined);
      expect(contextBuilder.buildContext).toHaveBeenCalled();
      // context is the built feature context
    });

    it('uses systemPromptOverride as context when provided', async () => {
      const result = await resolver.resolve('feat-1', '/wt', 'user msg', 'sys override');
      expect(result.context).toBe('sys override');
      expect(contextBuilder.buildContext).not.toHaveBeenCalled();
    });

    it('does not call findById when systemPromptOverride is set', async () => {
      await resolver.resolve('feat-1', '/wt', 'user msg', 'sys');
      expect(featureRepo.findById).not.toHaveBeenCalled();
    });
  });

  // Case 2: no pending content AND no systemPromptOverride → feature context IS the bootPrompt
  describe('case 2 — no pending content, no systemPromptOverride', () => {
    it('uses feature context as bootPrompt', async () => {
      const result = await resolver.resolve('feat-1', '/wt', undefined, undefined);
      expect(result.bootPrompt).toBe('built-context');
    });

    it('context equals the built feature context', async () => {
      const result = await resolver.resolve('feat-1', '/wt', undefined, undefined);
      expect(result.context).toBe('built-context');
    });

    it('calls buildContext with feature and worktreePath', async () => {
      await resolver.resolve('feat-1', '/wt', undefined, undefined);
      expect(contextBuilder.buildContext).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'feat-1' }),
        '/wt',
        expect.any(Array)
      );
    });

    it('passes PR URL when feature has one', async () => {
      featureRepo = makeFeatureRepo({ url: 'https://github.com/owner/repo/pull/1' });
      resolver = new BootPromptResolver(featureRepo, contextBuilder);
      await resolver.resolve('feat-1', '/wt', undefined, undefined);
      expect(contextBuilder.buildContext).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        ['https://github.com/owner/repo/pull/1']
      );
    });

    it('passes empty PR array when feature has no PR', async () => {
      await resolver.resolve('feat-1', '/wt', undefined, undefined);
      expect(contextBuilder.buildContext).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        []
      );
    });

    it('falls back to id-as-name when feature not found', async () => {
      (featureRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      await resolver.resolve('feat-unknown', '/wt', undefined, undefined);
      expect(contextBuilder.buildContext).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'feat-unknown', name: 'feat-unknown' }),
        '/wt',
        []
      );
    });
  });

  // Case 3: no pending content AND systemPromptOverride set → silent boot
  describe('case 3 — no pending content, systemPromptOverride set', () => {
    it('returns empty bootPrompt (silent boot)', async () => {
      const result = await resolver.resolve('feat-1', '/wt', undefined, 'my system prompt');
      expect(result.bootPrompt).toBe('');
    });

    it('uses systemPromptOverride as context', async () => {
      const result = await resolver.resolve('feat-1', '/wt', undefined, 'my system prompt');
      expect(result.context).toBe('my system prompt');
    });

    it('does not call findById (no feature lookup needed)', async () => {
      await resolver.resolve('feat-1', '/wt', undefined, 'my system prompt');
      expect(featureRepo.findById).not.toHaveBeenCalled();
    });

    it('does not call buildContext', async () => {
      await resolver.resolve('feat-1', '/wt', undefined, 'my system prompt');
      expect(contextBuilder.buildContext).not.toHaveBeenCalled();
    });
  });
});
