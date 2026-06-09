// @vitest-environment node

/**
 * DevEnvironmentAgentService Unit Tests
 *
 * Tests for the AI-driven dev environment analysis agent.
 * Uses a mock structured agent caller to test analysis logic,
 * caching behavior, and edge cases.
 *
 * TDD Phase: RED → GREEN → REFACTOR
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  DevEnvironmentAgentService,
  type DevEnvironmentAgentDeps,
} from '@/infrastructure/services/deployment/dev-environment-agent.service.js';
import type { DevEnvironmentAnalysis } from '@/application/ports/output/services/dev-environment-agent.interface.js';

function createMockDeps(overrides?: Partial<DevEnvironmentAgentDeps>): DevEnvironmentAgentDeps {
  return {
    structuredAgentCaller: {
      call: vi.fn().mockResolvedValue({
        deployable: true,
        reason: 'Detected Next.js project with dev script',
        command: 'pnpm dev',
        cwd: '.',
        expectedPort: 3000,
        language: 'node',
        framework: 'next.js',
        setupCommands: ['pnpm install'],
      } satisfies DevEnvironmentAnalysis),
    },
    readdir: vi.fn().mockReturnValue(['package.json', 'src', 'tsconfig.json']),
    readFile: vi.fn().mockReturnValue('{}'),
    existsSync: vi.fn().mockReturnValue(true),
    ...overrides,
  };
}

describe('DevEnvironmentAgentService', () => {
  let service: DevEnvironmentAgentService;
  let deps: DevEnvironmentAgentDeps;

  beforeEach(() => {
    deps = createMockDeps();
    service = new DevEnvironmentAgentService(deps);
  });

  describe('analyze', () => {
    it('should call the structured agent caller with a prompt containing directory listing', async () => {
      await service.analyze('/path/to/repo');

      expect(deps.structuredAgentCaller.call).toHaveBeenCalledTimes(1);
      const [prompt] = (deps.structuredAgentCaller.call as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(prompt).toContain('package.json');
      expect(prompt).toContain('src');
      expect(prompt).toContain('tsconfig.json');
    });

    it('should pass the correct JSON schema to the agent caller', async () => {
      await service.analyze('/path/to/repo');

      const [, schema] = (deps.structuredAgentCaller.call as ReturnType<typeof vi.fn>).mock
        .calls[0];
      expect(schema).toHaveProperty('type', 'object');
      expect(schema).toHaveProperty('required');
      expect((schema as { required: string[] }).required).toContain('deployable');
      expect((schema as { required: string[] }).required).toContain('reason');
      expect((schema as { required: string[] }).required).toContain('command');
    });

    it('should return the analysis from the agent', async () => {
      const result = await service.analyze('/path/to/repo');

      expect(result).toEqual({
        deployable: true,
        reason: 'Detected Next.js project with dev script',
        command: 'pnpm dev',
        cwd: '.',
        expectedPort: 3000,
        language: 'node',
        framework: 'next.js',
        setupCommands: ['pnpm install'],
      });
    });

    it('should return not-deployable for repos with no server to start', async () => {
      (deps.structuredAgentCaller.call as ReturnType<typeof vi.fn>).mockResolvedValue({
        deployable: false,
        reason: 'This is a CLI utility with no web server or UI to start',
        command: null,
        cwd: '.',
        expectedPort: null,
        language: 'node',
        framework: null,
        setupCommands: [],
      } satisfies DevEnvironmentAnalysis);

      const result = await service.analyze('/path/to/cli-tool');

      expect(result.deployable).toBe(false);
      expect(result.command).toBeNull();
      expect(result.reason).toContain('CLI utility');
    });

    it('should include key config file contents in the prompt', async () => {
      (deps.readdir as ReturnType<typeof vi.fn>).mockReturnValue([
        'package.json',
        'docker-compose.yml',
        'Makefile',
      ]);
      (deps.readFile as ReturnType<typeof vi.fn>).mockReturnValue(
        '{"scripts": {"dev": "next dev"}}'
      );

      await service.analyze('/path/to/repo');

      const [prompt] = (deps.structuredAgentCaller.call as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(prompt).toContain('package.json');
      expect(prompt).toContain('"scripts"');
    });

    it('should handle repos without a recognized config file gracefully', async () => {
      (deps.readdir as ReturnType<typeof vi.fn>).mockReturnValue(['README.md', 'data.csv']);
      (deps.readFile as ReturnType<typeof vi.fn>).mockReturnValue('');

      await service.analyze('/path/to/data-repo');

      expect(deps.structuredAgentCaller.call).toHaveBeenCalledTimes(1);
    });

    it('should throw when the repository path does not exist', async () => {
      (deps.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(false);

      await expect(service.analyze('/nonexistent/path')).rejects.toThrow(
        'Repository path does not exist'
      );
    });

    it('should pass silent and maxTurns options to the agent caller', async () => {
      await service.analyze('/path/to/repo');

      const [, , options] = (deps.structuredAgentCaller.call as ReturnType<typeof vi.fn>).mock
        .calls[0];
      expect(options).toMatchObject({
        silent: true,
        maxTurns: 3,
      });
    });
  });

  describe('caching', () => {
    it('should cache analysis results and return cached on second call', async () => {
      await service.analyze('/path/to/repo');
      await service.analyze('/path/to/repo');

      expect(deps.structuredAgentCaller.call).toHaveBeenCalledTimes(1);
    });

    it('should use separate cache entries for different repos', async () => {
      await service.analyze('/path/to/repo-a');
      await service.analyze('/path/to/repo-b');

      expect(deps.structuredAgentCaller.call).toHaveBeenCalledTimes(2);
    });

    it('should skip cache when skipCache option is true', async () => {
      await service.analyze('/path/to/repo');
      await service.analyze('/path/to/repo', { skipCache: true });

      expect(deps.structuredAgentCaller.call).toHaveBeenCalledTimes(2);
    });

    it('should update cache when skipCache forces re-analysis', async () => {
      (deps.structuredAgentCaller.call as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({
          deployable: true,
          reason: 'First analysis',
          command: 'npm run dev',
          cwd: '.',
          expectedPort: 3000,
          language: 'node',
          framework: null,
          setupCommands: [],
        })
        .mockResolvedValueOnce({
          deployable: true,
          reason: 'Updated analysis',
          command: 'pnpm dev',
          cwd: '.',
          expectedPort: 3000,
          language: 'node',
          framework: 'next.js',
          setupCommands: ['pnpm install'],
        });

      await service.analyze('/path/to/repo');
      const result = await service.analyze('/path/to/repo', { skipCache: true });

      expect(result.reason).toBe('Updated analysis');
      expect(result.command).toBe('pnpm dev');
    });

    it('should clear cache for a specific repo', async () => {
      await service.analyze('/path/to/repo');

      service.clearCache('/path/to/repo');

      await service.analyze('/path/to/repo');
      expect(deps.structuredAgentCaller.call).toHaveBeenCalledTimes(2);
    });

    it('should clear all caches', async () => {
      await service.analyze('/path/to/repo-a');
      await service.analyze('/path/to/repo-b');

      service.clearAllCaches();

      await service.analyze('/path/to/repo-a');
      await service.analyze('/path/to/repo-b');
      expect(deps.structuredAgentCaller.call).toHaveBeenCalledTimes(4);
    });

    it('should not cache failed analyses (agent throws)', async () => {
      (deps.structuredAgentCaller.call as ReturnType<typeof vi.fn>)
        .mockRejectedValueOnce(new Error('Agent unavailable'))
        .mockResolvedValueOnce({
          deployable: true,
          reason: 'Success on retry',
          command: 'npm run dev',
          cwd: '.',
          expectedPort: 3000,
          language: 'node',
          framework: null,
          setupCommands: [],
        });

      await expect(service.analyze('/path/to/repo')).rejects.toThrow('Agent unavailable');

      const result = await service.analyze('/path/to/repo');
      expect(result.reason).toBe('Success on retry');
      expect(deps.structuredAgentCaller.call).toHaveBeenCalledTimes(2);
    });
  });

  describe('prompt construction', () => {
    it('should include Python files in the analysis when present', async () => {
      (deps.readdir as ReturnType<typeof vi.fn>).mockReturnValue([
        'requirements.txt',
        'manage.py',
        'setup.py',
      ]);

      await service.analyze('/path/to/django-app');

      const [prompt] = (deps.structuredAgentCaller.call as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(prompt).toContain('requirements.txt');
      expect(prompt).toContain('manage.py');
    });

    it('should include Go files in the analysis when present', async () => {
      (deps.readdir as ReturnType<typeof vi.fn>).mockReturnValue(['go.mod', 'go.sum', 'main.go']);

      await service.analyze('/path/to/go-app');

      const [prompt] = (deps.structuredAgentCaller.call as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(prompt).toContain('go.mod');
    });

    it('should include Rust files in the analysis when present', async () => {
      (deps.readdir as ReturnType<typeof vi.fn>).mockReturnValue([
        'Cargo.toml',
        'Cargo.lock',
        'src',
      ]);

      await service.analyze('/path/to/rust-app');

      const [prompt] = (deps.structuredAgentCaller.call as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(prompt).toContain('Cargo.toml');
    });

    it('should read relevant config files and include their contents', async () => {
      (deps.readdir as ReturnType<typeof vi.fn>).mockReturnValue([
        'package.json',
        'docker-compose.yml',
      ]);
      (deps.readFile as ReturnType<typeof vi.fn>).mockImplementation((path: string) => {
        if (path.endsWith('package.json')) return '{"scripts":{"dev":"next dev"}}';
        if (path.endsWith('docker-compose.yml')) return 'version: "3"';
        return '';
      });

      await service.analyze('/path/to/repo');

      const [prompt] = (deps.structuredAgentCaller.call as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(prompt).toContain('next dev');
      expect(prompt).toContain('version: "3"');
    });

    it('should truncate large config files to prevent prompt overflow', async () => {
      (deps.readdir as ReturnType<typeof vi.fn>).mockReturnValue(['package.json']);
      const largeContent = 'x'.repeat(10_000);
      (deps.readFile as ReturnType<typeof vi.fn>).mockReturnValue(largeContent);

      await service.analyze('/path/to/repo');

      const [prompt] = (deps.structuredAgentCaller.call as ReturnType<typeof vi.fn>).mock.calls[0];
      // Should be truncated — exact limit is an implementation detail
      expect(prompt.length).toBeLessThan(largeContent.length + 2000);
    });
  });
});
