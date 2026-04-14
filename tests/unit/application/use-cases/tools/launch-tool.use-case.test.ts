/**
 * LaunchToolUseCase Unit Tests
 *
 * Tests the four result codes: ok:true (success), tool_not_found (unknown ID),
 * not_launchable (no openDirectory), and launch_failed (service returns ok:false).
 *
 * TDD Phase: RED-GREEN
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type {
  IIdeLauncherService,
  LaunchIdeResult,
} from '@/application/ports/output/services/ide-launcher-service.interface.js';
import type {
  IToolMetadataProvider,
  ToolMetadata,
} from '@/application/ports/output/services/tool-metadata-provider.interface.js';

// Controlled TOOL_METADATA fixture with two tools:
//   - vscode: has openDirectory (launchable)
//   - no-launch-tool: no openDirectory (not launchable)
const fixtureMetadata: Record<string, ToolMetadata> = {
  vscode: {
    name: 'Visual Studio Code',
    summary: 'Lightweight source code editor',
    description: 'VS Code detailed description',
    tags: ['ide'],
    binary: 'code',
    packageManager: 'apt',
    commands: { linux: 'apt install code', darwin: 'brew install code' },
    timeout: 300000,
    documentationUrl: 'https://code.visualstudio.com',
    verifyCommand: 'code --version',
    autoInstall: true,
    openDirectory: 'code {dir}',
  },
  'no-launch-tool': {
    name: 'No Launch Tool',
    summary: 'A tool without openDirectory',
    description: 'This tool has no openDirectory defined',
    tags: ['cli-agent'],
    binary: 'notool',
    packageManager: 'manual',
    commands: { linux: 'install manually' },
    timeout: 60000,
    documentationUrl: 'https://example.com',
    verifyCommand: 'notool --version',
    autoInstall: false,
    // no openDirectory field
  },
};

const fakeToolMetadataProvider: IToolMetadataProvider = {
  getToolById: (toolId: string) => fixtureMetadata[toolId],
  getAllEntries: () => Object.entries(fixtureMetadata),
};

import { LaunchToolUseCase } from '@/application/use-cases/tools/launch-tool.use-case.js';

describe('LaunchToolUseCase', () => {
  let useCase: LaunchToolUseCase;
  let mockService: IIdeLauncherService;

  const successResult: LaunchIdeResult = {
    ok: true,
    editorName: 'Visual Studio Code',
    worktreePath: '/some/path',
  };

  beforeEach(() => {
    mockService = {
      launch: vi
        .fn<(editorId: string, directoryPath: string) => Promise<LaunchIdeResult>>()
        .mockResolvedValue(successResult),
      checkAvailability: vi.fn<(editorId: string) => Promise<boolean>>().mockResolvedValue(true),
    };

    useCase = new LaunchToolUseCase(mockService, fakeToolMetadataProvider);
  });

  describe('success', () => {
    it('should return ok:true with editorName and path when launch succeeds', async () => {
      const result = await useCase.execute({ toolId: 'vscode', directoryPath: '/my/project' });

      expect(result).toEqual({
        ok: true,
        editorName: 'Visual Studio Code',
        path: '/my/project',
      });
      expect(mockService.launch).toHaveBeenCalledWith('vscode', '/my/project', {
        headless: undefined,
      });
    });
  });

  describe('tool_not_found', () => {
    it('should return ok:false with code tool_not_found when toolId is not in TOOL_METADATA', async () => {
      const result = await useCase.execute({
        toolId: 'nonexistent-tool',
        directoryPath: '/my/project',
      });

      expect(result).toEqual({
        ok: false,
        code: 'tool_not_found',
        message: expect.stringContaining('nonexistent-tool'),
      });
      expect(mockService.launch).not.toHaveBeenCalled();
    });
  });

  describe('not_launchable', () => {
    it('should return ok:false with code not_launchable when tool has no openDirectory', async () => {
      const result = await useCase.execute({
        toolId: 'no-launch-tool',
        directoryPath: '/my/project',
      });

      expect(result).toEqual({
        ok: false,
        code: 'not_launchable',
        message: expect.stringContaining('no-launch-tool'),
      });
      expect(mockService.launch).not.toHaveBeenCalled();
    });
  });

  describe('launch_failed', () => {
    it('should return ok:false with code launch_failed when IIdeLauncherService returns ok:false', async () => {
      vi.mocked(mockService.launch).mockResolvedValue({
        ok: false,
        code: 'launch_failed',
        message: 'spawn error: command not found',
      });

      const result = await useCase.execute({ toolId: 'vscode', directoryPath: '/my/project' });

      expect(result).toEqual({
        ok: false,
        code: 'launch_failed',
        message: 'spawn error: command not found',
      });
    });
  });
});
