/**
 * Feature New Command Unit Tests
 *
 * TDD Phase: RED-GREEN
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FeatureMode } from '@/domain/generated/output.js';

const { mockResolve, mockCreateExecute, mockFindByIdPrefix } = vi.hoisted(() => ({
  mockResolve: vi.fn(),
  mockCreateExecute: vi.fn(),
  mockFindByIdPrefix: vi.fn(),
}));

vi.mock('@/infrastructure/di/container.js', () => ({
  container: { resolve: (...args: unknown[]) => mockResolve(...args) },
}));

vi.mock('@/application/use-cases/features/create-feature.use-case.js', () => ({
  CreateFeatureUseCase: class {
    execute = mockCreateExecute;
  },
}));

vi.mock('@/infrastructure/services/filesystem/shep-directory.service.js', () => ({
  getShepHomeDir: () => '/home/test/.shep',
}));

vi.mock('../../../../../../src/presentation/cli/ui/index.js', () => ({
  colors: {
    muted: (s: string) => s,
    accent: (s: string) => s,
    success: (s: string) => s,
    brand: (s: string) => s,
  },
  messages: {
    newline: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
  spinner: vi.fn((_label: string, fn: () => Promise<unknown>) => fn()),
}));

const { mockGetSettings, mockHasSettings } = vi.hoisted(() => ({
  mockGetSettings: vi.fn(),
  mockHasSettings: vi.fn(),
}));

vi.mock('@/infrastructure/services/settings.service.js', () => ({
  getSettings: (...args: unknown[]) => mockGetSettings(...args),
  hasSettings: (...args: unknown[]) => mockHasSettings(...args),
}));

import { createNewCommand } from '../../../../../../src/presentation/cli/commands/feat/new.command.js';

function makeSettings(overrides: { openPr?: boolean } = {}) {
  return {
    workflow: {
      openPrOnImplementationComplete: overrides.openPr ?? false,
      approvalGateDefaults: {
        allowPrd: false,
        allowPlan: false,
        allowMerge: false,
        pushOnImplementationComplete: false,
      },
    },
  };
}

describe('createNewCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    process.exitCode = undefined as any;
    mockResolve.mockImplementation((token: unknown) => {
      const key = typeof token === 'string' ? token : (token as { name?: string })?.name;
      if (key === 'CreateFeatureUseCase') return { execute: mockCreateExecute };
      if (key === 'IFeatureRepository') return { findByIdPrefix: mockFindByIdPrefix };
      return {};
    });
    mockCreateExecute.mockResolvedValue({
      feature: {
        id: 'feat-001',
        name: 'Test Feature',
        slug: 'test-feature',
        branch: 'feat/test-feature',
        lifecycle: 'Requirements',
        agentRunId: 'run-001',
        specPath: '/specs/001-test-feature',
      },
    });
    mockHasSettings.mockReturnValue(true);
    mockGetSettings.mockReturnValue(makeSettings());
  });

  it('should create a command named "new"', () => {
    const cmd = createNewCommand();
    expect(cmd.name()).toBe('new');
  });

  it('should not have --interactive option', () => {
    const cmd = createNewCommand();
    const interactive = cmd.options.find((o) => o.long === '--interactive');
    expect(interactive).toBeUndefined();
  });

  describe('approval gates from flags', () => {
    it('should default to { allowPrd: false, allowPlan: false, allowMerge: false } when no flags', async () => {
      const cmd = createNewCommand();
      await cmd.parseAsync(['Add feature'], { from: 'user' });

      expect(mockCreateExecute).toHaveBeenCalledWith(
        expect.objectContaining({
          approvalGates: { allowPrd: false, allowPlan: false, allowMerge: false },
        })
      );
    });

    it('should set allowPrd=true with --allow-prd', async () => {
      const cmd = createNewCommand();
      await cmd.parseAsync(['Add feature', '--allow-prd'], { from: 'user' });

      expect(mockCreateExecute).toHaveBeenCalledWith(
        expect.objectContaining({
          approvalGates: { allowPrd: true, allowPlan: false, allowMerge: false },
        })
      );
    });

    it('should set allowPlan=true with --allow-plan', async () => {
      const cmd = createNewCommand();
      await cmd.parseAsync(['Add feature', '--allow-plan'], { from: 'user' });

      expect(mockCreateExecute).toHaveBeenCalledWith(
        expect.objectContaining({
          approvalGates: { allowPrd: false, allowPlan: true, allowMerge: false },
        })
      );
    });

    it('should compose --allow-prd and --allow-plan flags', async () => {
      const cmd = createNewCommand();
      await cmd.parseAsync(['Add feature', '--allow-prd', '--allow-plan'], { from: 'user' });

      expect(mockCreateExecute).toHaveBeenCalledWith(
        expect.objectContaining({
          approvalGates: { allowPrd: true, allowPlan: true, allowMerge: false },
        })
      );
    });

    it('should set allowMerge=true with --allow-merge', async () => {
      const cmd = createNewCommand();
      await cmd.parseAsync(['Add feature', '--allow-merge'], { from: 'user' });

      expect(mockCreateExecute).toHaveBeenCalledWith(
        expect.objectContaining({
          approvalGates: expect.objectContaining({ allowMerge: true }),
        })
      );
    });

    it('should set all gates true with --allow-all (fully autonomous)', async () => {
      const cmd = createNewCommand();
      await cmd.parseAsync(['Add feature', '--allow-all'], { from: 'user' });

      expect(mockCreateExecute).toHaveBeenCalledWith(
        expect.objectContaining({
          approvalGates: { allowPrd: true, allowPlan: true, allowMerge: true },
        })
      );
    });
  });

  describe('--pr flag', () => {
    it('should default openPr from settings (false)', async () => {
      mockGetSettings.mockReturnValue(makeSettings({ openPr: false }));

      const cmd = createNewCommand();
      await cmd.parseAsync(['Add feature'], { from: 'user' });

      expect(mockCreateExecute).toHaveBeenCalledWith(expect.objectContaining({ openPr: false }));
    });

    it('should default openPr from settings (true)', async () => {
      mockGetSettings.mockReturnValue(makeSettings({ openPr: true }));

      const cmd = createNewCommand();
      await cmd.parseAsync(['Add feature'], { from: 'user' });

      expect(mockCreateExecute).toHaveBeenCalledWith(expect.objectContaining({ openPr: true }));
    });

    it('should set openPr=true with --pr', async () => {
      const cmd = createNewCommand();
      await cmd.parseAsync(['Add feature', '--pr'], { from: 'user' });

      expect(mockCreateExecute).toHaveBeenCalledWith(expect.objectContaining({ openPr: true }));
    });

    it('should set openPr=false with --no-pr', async () => {
      mockGetSettings.mockReturnValue(makeSettings({ openPr: true }));

      const cmd = createNewCommand();
      await cmd.parseAsync(['Add feature', '--no-pr'], { from: 'user' });

      expect(mockCreateExecute).toHaveBeenCalledWith(expect.objectContaining({ openPr: false }));
    });
  });

  describe('settings fallback when settings unavailable', () => {
    it('should default openPr=false when settings not available', async () => {
      mockHasSettings.mockReturnValue(false);

      const cmd = createNewCommand();
      await cmd.parseAsync(['Add feature'], { from: 'user' });

      expect(mockCreateExecute).toHaveBeenCalledWith(expect.objectContaining({ openPr: false }));
    });
  });

  it('should show worktree path in output', async () => {
    const cmd = createNewCommand();
    await cmd.parseAsync(['Add feature'], { from: 'user' });

    const logCalls = (console.log as ReturnType<typeof vi.fn>).mock.calls
      .map((args) => args.join(' '))
      .join('\n');
    expect(logCalls).toMatch(/worktree/i);
    expect(logCalls).toMatch(/\.shep/);
  });

  it('should show spec path in output', async () => {
    const cmd = createNewCommand();
    await cmd.parseAsync(['Add feature'], { from: 'user' });

    const logCalls = (console.log as ReturnType<typeof vi.fn>).mock.calls
      .map((args) => args.join(' '))
      .join('\n');
    expect(logCalls).toMatch(/spec/i);
    expect(logCalls).toMatch(/001-test-feature/);
  });

  it('should show approval behavior hint in output', async () => {
    const cmd = createNewCommand();
    await cmd.parseAsync(['Add feature'], { from: 'user' });

    const logCalls = (console.log as ReturnType<typeof vi.fn>).mock.calls
      .map((args) => args.join(' '))
      .join('\n');
    expect(logCalls).toMatch(/pause after every phase/);
  });

  it('should show specific hint for --allow-prd', async () => {
    const cmd = createNewCommand();
    await cmd.parseAsync(['Add feature', '--allow-prd'], { from: 'user' });

    const logCalls = (console.log as ReturnType<typeof vi.fn>).mock.calls
      .map((args) => args.join(' '))
      .join('\n');
    expect(logCalls).toMatch(/auto-approve: PRD/);
  });

  it('should set exitCode 1 on error', async () => {
    mockCreateExecute.mockRejectedValue(new Error('Something failed'));

    const cmd = createNewCommand();
    await cmd.parseAsync(['Add feature'], { from: 'user' });

    expect(process.exitCode).toBe(1);
  });

  describe('--parent flag', () => {
    const parentFeature = {
      id: 'parent-feature-uuid-001',
      name: 'Parent Feature',
      lifecycle: 'Implementation',
    };

    it('should not pass parentId when --parent is not provided', async () => {
      const cmd = createNewCommand();
      await cmd.parseAsync(['Add feature'], { from: 'user' });

      expect(mockCreateExecute).toHaveBeenCalledWith(
        expect.not.objectContaining({ parentId: expect.anything() })
      );
    });

    it('should resolve parent ID prefix and pass parentId to use case', async () => {
      mockFindByIdPrefix.mockResolvedValue(parentFeature);

      const cmd = createNewCommand();
      await cmd.parseAsync(['Add feature', '--parent', 'parent-fe'], { from: 'user' });

      expect(mockFindByIdPrefix).toHaveBeenCalledWith('parent-fe');
      expect(mockCreateExecute).toHaveBeenCalledWith(
        expect.objectContaining({ parentId: 'parent-feature-uuid-001' })
      );
    });

    it('should display error and set exit code 1 when parent prefix is not found', async () => {
      mockFindByIdPrefix.mockResolvedValue(null);
      const { messages: mockMessages } = await import(
        '../../../../../../src/presentation/cli/ui/index.js'
      );

      const cmd = createNewCommand();
      await cmd.parseAsync(['Add feature', '--parent', 'nonexistent'], { from: 'user' });

      expect(process.exitCode).toBe(1);
      expect(mockMessages.error).toHaveBeenCalledWith(expect.stringContaining('nonexistent'));
      expect(mockCreateExecute).not.toHaveBeenCalled();
    });

    it('should show blocked-state message when created feature has Blocked lifecycle', async () => {
      mockFindByIdPrefix.mockResolvedValue(parentFeature);
      mockCreateExecute.mockResolvedValue({
        feature: {
          id: 'child-feat-001',
          name: 'Child Feature',
          slug: 'child-feature',
          branch: 'feat/child-feature',
          lifecycle: 'Blocked',
          agentRunId: null,
          specPath: null,
        },
      });
      const { messages: mockMessages } = await import(
        '../../../../../../src/presentation/cli/ui/index.js'
      );

      const cmd = createNewCommand();
      await cmd.parseAsync(['Child feature', '--parent', 'parent-fe'], { from: 'user' });

      expect(mockMessages.info).toHaveBeenCalledWith(expect.stringContaining('Blocked'));
    });

    it('should not show blocked-state message when created feature has non-Blocked lifecycle', async () => {
      mockFindByIdPrefix.mockResolvedValue(parentFeature);
      const { messages: mockMessages } = await import(
        '../../../../../../src/presentation/cli/ui/index.js'
      );

      const cmd = createNewCommand();
      await cmd.parseAsync(['Add feature', '--parent', 'parent-fe'], { from: 'user' });

      expect(mockMessages.info).not.toHaveBeenCalled();
    });

    it('should expose --parent option in command help', () => {
      const cmd = createNewCommand();
      const parentOption = cmd.options.find((o) => o.long === '--parent');
      expect(parentOption).toBeDefined();
      expect(parentOption?.description).toBeTruthy();
    });
  });

  describe('--fast flag', () => {
    it('should pass fast=true to use case when --fast is provided', async () => {
      const cmd = createNewCommand();
      await cmd.parseAsync(['Fix typo', '--fast'], { from: 'user' });

      expect(mockCreateExecute).toHaveBeenCalledWith(
        expect.objectContaining({ mode: FeatureMode.Fast })
      );
    });

    it('should use default mode from settings when --fast is not provided', async () => {
      const cmd = createNewCommand();
      await cmd.parseAsync(['Add feature'], { from: 'user' });

      const callArg = mockCreateExecute.mock.calls[0][0];
      // Default settings have no defaultMode set, so fallback is Fast
      expect(callArg.mode).toBe(FeatureMode.Fast);
    });

    it('should combine --fast with --allow-all', async () => {
      const cmd = createNewCommand();
      await cmd.parseAsync(['Fix typo', '--fast', '--allow-all'], { from: 'user' });

      expect(mockCreateExecute).toHaveBeenCalledWith(
        expect.objectContaining({
          mode: FeatureMode.Fast,
          approvalGates: { allowPrd: true, allowPlan: true, allowMerge: true },
        })
      );
    });

    it('should expose --fast option in command help', () => {
      const cmd = createNewCommand();
      const fastOption = cmd.options.find((o) => o.long === '--fast');
      expect(fastOption).toBeDefined();
      expect(fastOption?.description).toBeTruthy();
    });
  });

  describe('--explore flag', () => {
    it('should pass mode=Exploration to use case when --explore is provided', async () => {
      const cmd = createNewCommand();
      await cmd.parseAsync(['Explore an idea', '--explore'], { from: 'user' });

      expect(mockCreateExecute).toHaveBeenCalledWith(
        expect.objectContaining({ mode: FeatureMode.Exploration })
      );
    });

    it('should show error and set exit code 1 when both --explore and --fast are provided', async () => {
      const { messages: mockMessages } = await import(
        '../../../../../../src/presentation/cli/ui/index.js'
      );

      const cmd = createNewCommand();
      await cmd.parseAsync(['Explore an idea', '--explore', '--fast'], { from: 'user' });

      expect(process.exitCode).toBe(1);
      expect(mockMessages.error).toHaveBeenCalledWith(expect.stringContaining('--explore'));
      expect(mockCreateExecute).not.toHaveBeenCalled();
    });

    it('should use workflow default mode when no mode flag is provided', async () => {
      const cmd = createNewCommand();
      await cmd.parseAsync(['Add feature'], { from: 'user' });

      const callArg = mockCreateExecute.mock.calls[0][0];
      // Default settings have no defaultMode set, so fallback is Fast
      expect(callArg.mode).toBe(FeatureMode.Fast);
    });

    it('should expose --explore option in command help', () => {
      const cmd = createNewCommand();
      const exploreOption = cmd.options.find((o) => o.long === '--explore');
      expect(exploreOption).toBeDefined();
      expect(exploreOption?.description).toBeTruthy();
    });
  });

  describe('--model flag', () => {
    it('should expose --model option in command help', () => {
      const cmd = createNewCommand();
      const modelOption = cmd.options.find((o) => o.long === '--model');
      expect(modelOption).toBeDefined();
      expect(modelOption?.description).toBeTruthy();
    });

    it('should forward --model value to use case input', async () => {
      const cmd = createNewCommand();
      await cmd.parseAsync(['Add feature', '--model', 'claude-opus-4-6'], { from: 'user' });

      expect(mockCreateExecute).toHaveBeenCalledWith(
        expect.objectContaining({ model: 'claude-opus-4-6' })
      );
    });

    it('should not include model in use case input when --model is not provided', async () => {
      const cmd = createNewCommand();
      await cmd.parseAsync(['Add feature'], { from: 'user' });

      expect(mockCreateExecute).toHaveBeenCalledWith(
        expect.not.objectContaining({ model: expect.anything() })
      );
    });

    it('should accept arbitrary model strings without validation', async () => {
      const cmd = createNewCommand();
      await cmd.parseAsync(['Add feature', '--model', 'any-future-model-id'], { from: 'user' });

      expect(mockCreateExecute).toHaveBeenCalledWith(
        expect.objectContaining({ model: 'any-future-model-id' })
      );
    });
  });

  describe('--pending flag', () => {
    it('should expose --pending option in command help', () => {
      const cmd = createNewCommand();
      const pendingOption = cmd.options.find((o) => o.long === '--pending');
      expect(pendingOption).toBeDefined();
      expect(pendingOption?.description).toBeTruthy();
    });

    it('should pass pending=true to use case when --pending is provided', async () => {
      mockCreateExecute.mockResolvedValue({
        feature: {
          id: 'feat-001',
          name: 'Test Feature',
          slug: 'test-feature',
          branch: 'feat/test-feature',
          lifecycle: 'Pending',
          agentRunId: 'run-001',
          specPath: '/specs/001-test-feature',
        },
      });

      const cmd = createNewCommand();
      await cmd.parseAsync(['Add feature', '--pending'], { from: 'user' });

      expect(mockCreateExecute).toHaveBeenCalledWith(expect.objectContaining({ pending: true }));
    });

    it('should not set pending on input when --pending is not provided', async () => {
      const cmd = createNewCommand();
      await cmd.parseAsync(['Add feature'], { from: 'user' });

      const callArg = mockCreateExecute.mock.calls[0][0];
      expect(callArg.pending).toBeUndefined();
    });

    it('should show pending-state info message when created feature has Pending lifecycle', async () => {
      mockCreateExecute.mockResolvedValue({
        feature: {
          id: 'feat-001',
          name: 'Pending Feature',
          slug: 'pending-feature',
          branch: 'feat/pending-feature',
          lifecycle: 'Pending',
          agentRunId: 'run-001',
          specPath: '/specs/001-pending-feature',
        },
      });
      const { messages: mockMessages } = await import(
        '../../../../../../src/presentation/cli/ui/index.js'
      );

      const cmd = createNewCommand();
      await cmd.parseAsync(['Add feature', '--pending'], { from: 'user' });

      expect(mockMessages.info).toHaveBeenCalledWith(expect.stringContaining('Pending'));
    });

    it('should show "pending" agent status when lifecycle is Pending', async () => {
      mockCreateExecute.mockResolvedValue({
        feature: {
          id: 'feat-001',
          name: 'Pending Feature',
          slug: 'pending-feature',
          branch: 'feat/pending-feature',
          lifecycle: 'Pending',
          agentRunId: 'run-001',
          specPath: '/specs/001-pending-feature',
        },
      });

      const cmd = createNewCommand();
      await cmd.parseAsync(['Add feature', '--pending'], { from: 'user' });

      const logCalls = (console.log as ReturnType<typeof vi.fn>).mock.calls
        .map((args) => args.join(' '))
        .join('\n');
      expect(logCalls).toMatch(/pending/i);
    });

    it('should combine --pending with --parent flag', async () => {
      mockFindByIdPrefix.mockResolvedValue({
        id: 'parent-feature-uuid-001',
        name: 'Parent Feature',
        lifecycle: 'Implementation',
      });
      mockCreateExecute.mockResolvedValue({
        feature: {
          id: 'feat-002',
          name: 'Child Pending',
          slug: 'child-pending',
          branch: 'feat/child-pending',
          lifecycle: 'Pending',
          agentRunId: 'run-002',
          specPath: '/specs/002-child-pending',
        },
      });

      const cmd = createNewCommand();
      await cmd.parseAsync(['Child feature', '--pending', '--parent', 'parent-fe'], {
        from: 'user',
      });

      expect(mockCreateExecute).toHaveBeenCalledWith(
        expect.objectContaining({
          pending: true,
          parentId: 'parent-feature-uuid-001',
        })
      );
    });
  });

  describe('--inject-skills flag', () => {
    it('should expose --inject-skills option in command help', () => {
      const cmd = createNewCommand();
      const option = cmd.options.find((o) => o.long === '--inject-skills');
      expect(option).toBeDefined();
      expect(option?.description).toBeTruthy();
    });

    it('should pass injectSkills=true to use case when --inject-skills is provided', async () => {
      const cmd = createNewCommand();
      await cmd.parseAsync(['Add feature', '--inject-skills'], { from: 'user' });

      expect(mockCreateExecute).toHaveBeenCalledWith(
        expect.objectContaining({ injectSkills: true })
      );
    });

    it('should pass injectSkills=false to use case when --no-inject-skills is provided', async () => {
      const cmd = createNewCommand();
      await cmd.parseAsync(['Add feature', '--no-inject-skills'], { from: 'user' });

      expect(mockCreateExecute).toHaveBeenCalledWith(
        expect.objectContaining({ injectSkills: false })
      );
    });

    it('should not include injectSkills in use case input when neither flag is provided', async () => {
      const cmd = createNewCommand();
      await cmd.parseAsync(['Add feature'], { from: 'user' });

      const callArg = mockCreateExecute.mock.calls[0][0];
      expect(callArg.injectSkills).toBeUndefined();
    });
  });

  describe('--attach flag', () => {
    it('should expose --attach option in command help', () => {
      const cmd = createNewCommand();
      const attachOption = cmd.options.find((o) => o.long === '--attach');
      expect(attachOption).toBeDefined();
      expect(attachOption?.description).toBeTruthy();
    });

    it('should pass attachmentPaths to use case when --attach is provided with valid paths', async () => {
      const { mkdtempSync, writeFileSync } = await import('fs');
      const { join } = await import('path');
      const { tmpdir } = await import('os');
      const tmp = mkdtempSync(join(tmpdir(), 'shep-cli-attach-'));
      const filePath = join(tmp, 'test.png');
      writeFileSync(filePath, 'fake image data');

      const cmd = createNewCommand();
      await cmd.parseAsync(['Add feature', '--attach', filePath], { from: 'user' });

      expect(mockCreateExecute).toHaveBeenCalledWith(
        expect.objectContaining({
          attachmentPaths: [filePath],
        })
      );

      const { rmSync } = await import('fs');
      rmSync(tmp, { recursive: true, force: true });
    });

    it('should exit with code 1 when --attach path does not exist', async () => {
      const { messages: mockMessages } = await import(
        '../../../../../../src/presentation/cli/ui/index.js'
      );

      const cmd = createNewCommand();
      await cmd.parseAsync(['Add feature', '--attach', '/nonexistent/file.png'], { from: 'user' });

      expect(process.exitCode).toBe(1);
      expect(mockMessages.error).toHaveBeenCalledWith(expect.stringContaining('nonexistent'));
      expect(mockCreateExecute).not.toHaveBeenCalled();
    });

    it('should support multiple --attach flags', async () => {
      const { mkdtempSync, writeFileSync } = await import('fs');
      const { join } = await import('path');
      const { tmpdir } = await import('os');
      const tmp = mkdtempSync(join(tmpdir(), 'shep-cli-attach-'));
      const file1 = join(tmp, 'a.png');
      const file2 = join(tmp, 'b.pdf');
      writeFileSync(file1, 'data1');
      writeFileSync(file2, 'data2');

      const cmd = createNewCommand();
      await cmd.parseAsync(['Add feature', '--attach', file1, '--attach', file2], { from: 'user' });

      expect(mockCreateExecute).toHaveBeenCalledWith(
        expect.objectContaining({
          attachmentPaths: [file1, file2],
        })
      );

      const { rmSync } = await import('fs');
      rmSync(tmp, { recursive: true, force: true });
    });
  });
});
