import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FeatureMode } from '@shepai/core/domain/generated/output';

const mockCreateRecord = vi.fn();
const mockInitializeAndSpawn = vi
  .fn()
  .mockResolvedValue({ warning: undefined, updatedFeature: {} });
vi.mock('../../../../../../src/presentation/web/lib/server-container.js', () => ({
  resolve: () => ({
    createRecord: mockCreateRecord,
    initializeAndSpawn: mockInitializeAndSpawn,
  }),
}));

vi.mock('@shepai/core/application/use-cases/features/create/create-feature.use-case', () => ({
  CreateFeatureUseCase: class CreateFeatureUseCase {},
}));

const { createFeature } = await import(
  '../../../../../../src/presentation/web/app/actions/create-feature.js'
);

describe('createFeature server action', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // --- Success paths ---

  it('returns feature on success', async () => {
    const feature = { id: '1', name: 'My Feature', slug: 'my-feature' };
    mockCreateRecord.mockResolvedValue({ feature, shouldSpawn: true });

    const result = await createFeature({
      description: 'A description',
      repositoryPath: '/repo',
    });

    expect(result).toEqual({ feature });
  });

  // --- userInput composition ---

  it('composes userInput from description only', async () => {
    const feature = { id: '3', name: 'Test', slug: 'test' };
    mockCreateRecord.mockResolvedValue({ feature, shouldSpawn: true });

    await createFeature({
      description: 'Add login and signup',
      repositoryPath: '/repo',
    });

    expect(mockCreateRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        userInput: 'Add login and signup',
        repositoryPath: '/repo',
        description: 'Add login and signup',
      })
    );
  });

  it('does not include a name field in createRecord call', async () => {
    const feature = { id: '4', name: 'Test', slug: 'test' };
    mockCreateRecord.mockResolvedValue({ feature, shouldSpawn: true });

    await createFeature({
      description: 'Some feature',
      repositoryPath: '/repo',
    });

    const callArg = mockCreateRecord.mock.calls[0][0];
    expect(callArg).not.toHaveProperty('name');
  });

  it('appends attachment file paths to userInput', async () => {
    const feature = { id: '6', name: 'Test', slug: 'test' };
    mockCreateRecord.mockResolvedValue({ feature, shouldSpawn: true });

    await createFeature({
      description: 'See attached',
      repositoryPath: '/repo',
      attachments: [
        { path: '/src/index.ts', name: 'index.ts' },
        { path: '/src/utils.ts', name: 'utils.ts' },
      ],
    });

    expect(mockCreateRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        userInput: 'See attached\n\n@/src/index.ts @/src/utils.ts',
        repositoryPath: '/repo',
        description: 'See attached',
      })
    );
  });

  it('appends attachments to description-only userInput', async () => {
    const feature = { id: '7', name: 'Test', slug: 'test' };
    mockCreateRecord.mockResolvedValue({ feature, shouldSpawn: true });

    await createFeature({
      description: 'Build a dashboard',
      repositoryPath: '/repo',
      attachments: [{ path: '/readme.md', name: 'readme.md' }],
    });

    expect(mockCreateRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        userInput: 'Build a dashboard\n\n@/readme.md',
        repositoryPath: '/repo',
        description: 'Build a dashboard',
      })
    );
  });

  // --- Validation errors ---

  it('returns error when description is missing', async () => {
    const result = await createFeature({
      description: '',
      repositoryPath: '/repo',
    });

    expect(result).toEqual({ error: 'description is required' });
    expect(mockCreateRecord).not.toHaveBeenCalled();
  });

  it('returns error when description is whitespace-only', async () => {
    const result = await createFeature({
      description: '   ',
      repositoryPath: '/repo',
    });

    expect(result).toEqual({ error: 'description is required' });
    expect(mockCreateRecord).not.toHaveBeenCalled();
  });

  it('returns error when repositoryPath is missing', async () => {
    const result = await createFeature({
      description: 'A feature',
      repositoryPath: '',
    });

    expect(result).toEqual({ error: 'repositoryPath is required' });
    expect(mockCreateRecord).not.toHaveBeenCalled();
  });

  // --- Internal errors ---

  it('returns error when createFeature throws Error', async () => {
    mockCreateRecord.mockRejectedValue(new Error('Worktree creation failed'));

    const result = await createFeature({ description: 'Broken', repositoryPath: '/repo' });

    expect(result).toEqual({ error: 'Worktree creation failed' });
  });

  it('returns generic error when createFeature throws non-Error', async () => {
    mockCreateRecord.mockRejectedValue('something unexpected');

    const result = await createFeature({ description: 'Broken', repositoryPath: '/repo' });

    expect(result).toEqual({ error: 'Failed to create feature' });
  });

  // --- approvalGates forwarding ---

  describe('approvalGates', () => {
    it('forwards { allowPrd: true, allowPlan: false } with allowMerge defaulted', async () => {
      mockCreateRecord.mockResolvedValue({ feature: { id: '1' }, shouldSpawn: true });

      await createFeature({
        description: 'Test feature',
        repositoryPath: '/repo',
        approvalGates: { allowPrd: true, allowPlan: false },
      });

      expect(mockCreateRecord).toHaveBeenCalledWith(
        expect.objectContaining({
          approvalGates: { allowPrd: true, allowPlan: false, allowMerge: false },
        })
      );
    });

    it('forwards full approvalGates including allowMerge', async () => {
      mockCreateRecord.mockResolvedValue({ feature: { id: '1' }, shouldSpawn: true });

      await createFeature({
        description: 'Test feature',
        repositoryPath: '/repo',
        approvalGates: { allowPrd: true, allowPlan: true, allowMerge: true },
      });

      expect(mockCreateRecord).toHaveBeenCalledWith(
        expect.objectContaining({
          approvalGates: { allowPrd: true, allowPlan: true, allowMerge: true },
        })
      );
    });

    it('defaults to all false when approvalGates is omitted', async () => {
      mockCreateRecord.mockResolvedValue({ feature: { id: '1' }, shouldSpawn: true });

      await createFeature({ description: 'Test feature', repositoryPath: '/repo' });

      expect(mockCreateRecord).toHaveBeenCalledWith(
        expect.objectContaining({
          approvalGates: { allowPrd: false, allowPlan: false, allowMerge: false },
        })
      );
    });
  });

  // --- fast flag forwarding ---

  describe('fast flag forwarding', () => {
    it('passes fast=true to createRecord when input has fast=true', async () => {
      mockCreateRecord.mockResolvedValue({ feature: { id: '1' }, shouldSpawn: true });

      await createFeature({
        description: 'Fix the typo',
        repositoryPath: '/repo',
        mode: FeatureMode.Fast,
      });

      expect(mockCreateRecord).toHaveBeenCalledWith(
        expect.objectContaining({ mode: FeatureMode.Fast })
      );
    });

    it('omits fast when input has fast=false', async () => {
      mockCreateRecord.mockResolvedValue({ feature: { id: '1' }, shouldSpawn: true });

      await createFeature({
        description: 'Fix the typo',
        repositoryPath: '/repo',
        mode: FeatureMode.Regular,
      });

      const callArg = mockCreateRecord.mock.calls[0][0];
      expect(callArg).not.toHaveProperty('fast');
    });

    it('omits fast when input does not include fast', async () => {
      mockCreateRecord.mockResolvedValue({ feature: { id: '1' }, shouldSpawn: true });

      await createFeature({
        description: 'Fix the typo',
        repositoryPath: '/repo',
      });

      const callArg = mockCreateRecord.mock.calls[0][0];
      expect(callArg).not.toHaveProperty('fast');
    });

    it('passes fast=true to initializeAndSpawn when input has fast=true', async () => {
      const feature = { id: '1', name: 'Test', slug: 'test' };
      mockCreateRecord.mockResolvedValue({ feature, shouldSpawn: true });

      await createFeature({
        description: 'Fix the typo',
        repositoryPath: '/repo',
        mode: FeatureMode.Fast,
      });

      expect(mockInitializeAndSpawn).toHaveBeenCalledWith(
        feature,
        expect.objectContaining({ mode: FeatureMode.Fast }),
        true
      );
    });
  });

  // --- push/openPr forwarding ---

  describe('push/openPr forwarding', () => {
    it('forwards push=true and openPr=true', async () => {
      mockCreateRecord.mockResolvedValue({ feature: { id: '1' }, shouldSpawn: true });

      await createFeature({
        description: 'Test feature',
        repositoryPath: '/repo',
        push: true,
        openPr: true,
      });

      expect(mockCreateRecord).toHaveBeenCalledWith(
        expect.objectContaining({
          push: true,
          openPr: true,
        })
      );
    });

    it('defaults both to false when omitted', async () => {
      mockCreateRecord.mockResolvedValue({ feature: { id: '1' }, shouldSpawn: true });

      await createFeature({ description: 'Test feature', repositoryPath: '/repo' });

      expect(mockCreateRecord).toHaveBeenCalledWith(
        expect.objectContaining({
          push: false,
          openPr: false,
        })
      );
    });

    it('forwards push=true with openPr defaulting to false', async () => {
      mockCreateRecord.mockResolvedValue({ feature: { id: '1' }, shouldSpawn: true });

      await createFeature({
        description: 'Test feature',
        repositoryPath: '/repo',
        push: true,
      });

      expect(mockCreateRecord).toHaveBeenCalledWith(
        expect.objectContaining({
          push: true,
          openPr: false,
        })
      );
    });

    it('forwards openPr=true with push defaulting to false', async () => {
      mockCreateRecord.mockResolvedValue({ feature: { id: '1' }, shouldSpawn: true });

      await createFeature({
        description: 'Test feature',
        repositoryPath: '/repo',
        openPr: true,
      });

      expect(mockCreateRecord).toHaveBeenCalledWith(
        expect.objectContaining({
          push: false,
          openPr: true,
        })
      );
    });
  });
});
