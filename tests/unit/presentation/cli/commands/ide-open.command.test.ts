// @vitest-environment node

/**
 * IDE Open Command Unit Tests
 *
 * Tests for the `shep ide <feat-id>` command.
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Command } from 'commander';

// --- Mocks ---

vi.mock('@/infrastructure/di/container.js', () => ({
  container: {
    resolve: vi.fn(),
  },
}));

vi.mock('@/application/use-cases/features/show-feature.use-case.js', () => ({
  ShowFeatureUseCase: class {},
}));

vi.mock('@/application/use-cases/ide/launch-ide.use-case.js', () => ({
  LaunchIdeUseCase: class {},
}));

vi.mock('@/infrastructure/services/settings.service.js', () => ({
  getSettings: vi.fn(() => ({
    environment: { defaultEditor: 'vscode' },
  })),
}));

vi.mock('@/infrastructure/services/tool-installer/tool-metadata.js', () => ({
  getIdeEntries: vi.fn(() => [
    ['vscode', { name: 'Visual Studio Code', summary: 'Code editor', openDirectory: 'code {dir}' }],
    ['cursor', { name: 'Cursor', summary: 'AI editor', openDirectory: 'cursor {dir}' }],
    ['windsurf', { name: 'Windsurf', summary: 'Windsurf editor', openDirectory: 'windsurf {dir}' }],
    ['zed', { name: 'Zed', summary: 'Zed editor', openDirectory: 'zed {dir}' }],
    [
      'antigravity',
      {
        name: 'Antigravity',
        summary: 'Google Antigravity IDE',
        openDirectory: 'antigravity {dir}',
      },
    ],
    [
      'claude-code',
      { name: 'Claude Code', summary: 'AI assistant', openDirectory: 'claude {dir}' },
    ],
  ]),
}));

vi.mock('../../../../../src/presentation/cli/ui/index.js', () => ({
  messages: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  },
  colors: { accent: (s: string) => s },
  symbols: {},
  fmt: {},
}));

// Import after mocks
import { createIdeOpenCommand } from '../../../../../src/presentation/cli/commands/ide-open.command.js';
import { container } from '@/infrastructure/di/container.js';
import { ShowFeatureUseCase } from '@/application/use-cases/features/show-feature.use-case.js';
import { LaunchIdeUseCase } from '@/application/use-cases/ide/launch-ide.use-case.js';
import { getSettings } from '@/infrastructure/services/settings.service.js';
import { messages } from '../../../../../src/presentation/cli/ui/index.js';

describe('IDE Open Command', () => {
  let mockShowFeatureExecute: ReturnType<typeof vi.fn>;
  let mockLaunchIdeExecute: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(getSettings).mockReturnValue({
      environment: { defaultEditor: 'vscode' },
    } as any);

    mockShowFeatureExecute = vi.fn().mockResolvedValue({
      id: 'feat-123-abc',
      name: 'test-feature',
      repositoryPath: '/home/user/project',
      branch: 'feat/test-feature',
    });

    mockLaunchIdeExecute = vi.fn().mockResolvedValue({
      ok: true,
      editorName: 'VS Code',
      worktreePath: '/mock/.shep/repos/abc123/wt/feat-test-feature',
    });

    vi.mocked(container.resolve).mockImplementation((token: unknown) => {
      if (token === ShowFeatureUseCase) return { execute: mockShowFeatureExecute };
      if (token === LaunchIdeUseCase) return { execute: mockLaunchIdeExecute };
      return { execute: vi.fn() };
    });
  });

  describe('command structure', () => {
    it('should create a valid Commander command', () => {
      const cmd = createIdeOpenCommand();
      expect(cmd).toBeInstanceOf(Command);
    });

    it('should have the name "ide"', () => {
      const cmd = createIdeOpenCommand();
      expect(cmd.name()).toBe('ide');
    });

    it('should accept feat-id as a required argument', () => {
      const cmd = createIdeOpenCommand();
      const args = (cmd as any)._args;
      expect(args).toHaveLength(1);
      expect(args[0].name()).toBe('feat-id');
      expect(args[0].required).toBe(true);
    });

    it('should dynamically generate IDE option flags from metadata', () => {
      const cmd = createIdeOpenCommand();
      const expectedFlags = ['--vscode', '--cursor', '--windsurf', '--zed', '--antigravity'];
      for (const flag of expectedFlags) {
        const opt = cmd.options.find((o) => o.long === flag);
        expect(opt, `Expected option ${flag}`).toBeDefined();
      }
    });

    it('should include examples in help output', () => {
      const cmd = createIdeOpenCommand();
      let output = '';
      cmd.configureOutput({
        writeOut: (text) => {
          output += text;
        },
      });
      cmd.exitOverride();
      try {
        cmd.parse(['node', 'test', 'feat-abc12345', '--help']);
      } catch {
        // Commander throws when help is requested with exitOverride enabled.
      }

      expect(output).toContain('Examples:');
      expect(output).toContain(
        '$ shep ide feat-abc12345                Open the configured default editor'
      );
      expect(output).toContain('$ shep ide feat-abc12345 --vscode        Force Visual Studio Code');
      expect(output).toContain('$ shep ide feat-abc12345 --cursor        Force Cursor');
    });
  });

  describe('IDE selection', () => {
    it('should use defaultEditor from settings when no flag provided', async () => {
      vi.mocked(getSettings).mockReturnValue({
        environment: { defaultEditor: 'vscode' },
      } as any);

      const cmd = createIdeOpenCommand();
      await cmd.parseAsync(['node', 'test', 'feat-123']);

      expect(mockLaunchIdeExecute).toHaveBeenCalledWith(
        expect.objectContaining({ editorId: 'vscode' })
      );
      expect(messages.success).toHaveBeenCalledWith(expect.stringContaining('VS Code'));
    });

    it('should use --cursor flag to override settings', async () => {
      vi.mocked(getSettings).mockReturnValue({
        environment: { defaultEditor: 'vscode' },
      } as any);
      mockLaunchIdeExecute.mockResolvedValue({
        ok: true,
        editorName: 'Cursor',
        worktreePath: '/mock/.shep/repos/abc123/wt/feat-test-feature',
      });

      const cmd = createIdeOpenCommand();
      await cmd.parseAsync(['node', 'test', 'feat-123', '--cursor']);

      expect(mockLaunchIdeExecute).toHaveBeenCalledWith(
        expect.objectContaining({ editorId: 'cursor' })
      );
      expect(messages.success).toHaveBeenCalledWith(expect.stringContaining('Cursor'));
    });

    it('should use --antigravity flag to override settings', async () => {
      vi.mocked(getSettings).mockReturnValue({
        environment: { defaultEditor: 'vscode' },
      } as any);
      mockLaunchIdeExecute.mockResolvedValue({
        ok: true,
        editorName: 'Antigravity',
        worktreePath: '/mock/.shep/repos/abc123/wt/feat-test-feature',
      });

      const cmd = createIdeOpenCommand();
      await cmd.parseAsync(['node', 'test', 'feat-123', '--antigravity']);

      expect(mockLaunchIdeExecute).toHaveBeenCalledWith(
        expect.objectContaining({ editorId: 'antigravity' })
      );
      expect(messages.success).toHaveBeenCalledWith(expect.stringContaining('Antigravity'));
    });

    it('should use --claude-code flag (hyphenated) to override settings', async () => {
      vi.mocked(getSettings).mockReturnValue({
        environment: { defaultEditor: 'vscode' },
      } as any);
      mockLaunchIdeExecute.mockResolvedValue({
        ok: true,
        editorName: 'Claude Code',
        worktreePath: '/mock/.shep/repos/abc123/wt/feat-test-feature',
      });

      const cmd = createIdeOpenCommand();
      await cmd.parseAsync(['node', 'test', 'feat-123', '--claude-code']);

      expect(mockLaunchIdeExecute).toHaveBeenCalledWith(
        expect.objectContaining({ editorId: 'claude-code' })
      );
      expect(messages.success).toHaveBeenCalledWith(expect.stringContaining('Claude Code'));
    });
  });

  describe('feature resolution', () => {
    it('should resolve feature via ShowFeatureUseCase', async () => {
      const cmd = createIdeOpenCommand();
      await cmd.parseAsync(['node', 'test', 'feat-123']);

      expect(mockShowFeatureExecute).toHaveBeenCalledWith('feat-123');
    });

    it('should pass feature repositoryPath and branch to LaunchIdeUseCase', async () => {
      const cmd = createIdeOpenCommand();
      await cmd.parseAsync(['node', 'test', 'feat-123']);

      expect(mockLaunchIdeExecute).toHaveBeenCalledWith(
        expect.objectContaining({
          repositoryPath: '/home/user/project',
          branch: 'feat/test-feature',
        })
      );
    });
  });

  describe('use case resolution', () => {
    it('should resolve both ShowFeatureUseCase and LaunchIdeUseCase from container', async () => {
      const cmd = createIdeOpenCommand();
      await cmd.parseAsync(['node', 'test', 'feat-123']);

      expect(container.resolve).toHaveBeenCalledWith(ShowFeatureUseCase);
      expect(container.resolve).toHaveBeenCalledWith(LaunchIdeUseCase);
    });
  });

  describe('success message', () => {
    it('should include IDE name in success message', async () => {
      const cmd = createIdeOpenCommand();
      await cmd.parseAsync(['node', 'test', 'feat-123']);

      expect(messages.success).toHaveBeenCalledWith(expect.stringContaining('VS Code'));
    });
  });

  describe('error handling', () => {
    it('should handle feature not found error', async () => {
      mockShowFeatureExecute.mockRejectedValue(new Error('Feature not found'));

      const cmd = createIdeOpenCommand();
      await cmd.parseAsync(['node', 'test', 'unknown-id']);

      expect(messages.error).toHaveBeenCalled();
    });

    it('should handle LaunchIdeUseCase failure result', async () => {
      mockLaunchIdeExecute.mockResolvedValue({
        ok: false,
        code: 'unknown_editor',
        message: 'No launcher found for editor: notepad',
      });

      const cmd = createIdeOpenCommand();
      await cmd.parseAsync(['node', 'test', 'feat-123']);

      expect(messages.error).toHaveBeenCalled();
    });
  });
});
