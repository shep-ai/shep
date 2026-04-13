/**
 * McpServerManagerService Unit Tests
 *
 * Tests for MCP server process lifecycle management:
 * - Spawn child processes for MCP plugins
 * - Reference counting for shared servers across features
 * - Per-feature temp .mcp.json file generation
 * - Cleanup on feature stop and shutdown
 *
 * TDD Phase: RED-GREEN
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import {
  McpServerManagerService,
  type SpawnFn,
} from '@/infrastructure/services/plugin/mcp-server-manager.service.js';
import { PluginType, PluginTransport, PluginHealthStatus } from '@/domain/generated/output.js';
import type { Plugin } from '@/domain/generated/output.js';

/**
 * Creates a minimal MCP-type plugin for testing.
 */
function createMcpPlugin(overrides: Partial<Plugin> = {}): Plugin {
  return {
    id: 'plugin-1',
    name: 'test-plugin',
    displayName: 'Test Plugin',
    type: PluginType.Mcp,
    transport: PluginTransport.Stdio,
    serverCommand: 'node',
    serverArgs: ['server.js'],
    enabled: true,
    healthStatus: PluginHealthStatus.Healthy,
    requiredEnvVars: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

/**
 * Creates a fake child process for testing.
 */
function createFakeProcess(pid = 12345) {
  const listeners: Record<string, ((...args: unknown[]) => void)[]> = {};
  return {
    pid,
    kill: vi.fn(),
    on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      listeners[event] = listeners[event] ?? [];
      listeners[event].push(handler);
    }),
    stdout: { on: vi.fn() },
    stderr: { on: vi.fn() },
    stdin: null,
    _listeners: listeners,
    _emit(event: string, ...args: unknown[]) {
      for (const handler of listeners[event] ?? []) {
        handler(...args);
      }
    },
  };
}

describe('McpServerManagerService', () => {
  let service: McpServerManagerService;
  let spawnMock: ReturnType<typeof vi.fn<SpawnFn>>;
  let fakeProcess: ReturnType<typeof createFakeProcess>;

  beforeEach(() => {
    fakeProcess = createFakeProcess();
    spawnMock = vi.fn<SpawnFn>().mockReturnValue(fakeProcess);
    service = new McpServerManagerService(spawnMock);
  });

  afterEach(async () => {
    // Clean up any managed servers
    await service.shutdown();
  });

  describe('startServersForFeature', () => {
    it('should spawn a child process for each MCP plugin', async () => {
      const plugin = createMcpPlugin();
      await service.startServersForFeature('feature-1', [plugin]);

      expect(spawnMock).toHaveBeenCalledOnce();
      expect(spawnMock).toHaveBeenCalledWith(
        'node',
        ['server.js'],
        expect.objectContaining({
          stdio: ['pipe', 'pipe', 'pipe'],
        })
      );
    });

    it('should pass required env vars from process.env to child process', async () => {
      const originalKey = process.env.TEST_API_KEY;
      process.env.TEST_API_KEY = 'secret-value';

      try {
        const plugin = createMcpPlugin({
          requiredEnvVars: ['TEST_API_KEY'],
        });
        await service.startServersForFeature('feature-1', [plugin]);

        const spawnCall = spawnMock.mock.calls[0];
        const spawnOpts = spawnCall[2] as Record<string, unknown>;
        const env = spawnOpts.env as Record<string, string>;
        expect(env).toHaveProperty('TEST_API_KEY', 'secret-value');
        expect(env).toHaveProperty('PATH');
      } finally {
        if (originalKey === undefined) {
          delete process.env.TEST_API_KEY;
        } else {
          process.env.TEST_API_KEY = originalKey;
        }
      }
    });

    it('should skip non-MCP plugins', async () => {
      const hookPlugin = createMcpPlugin({
        type: PluginType.Hook,
        serverCommand: undefined,
      });
      await service.startServersForFeature('feature-1', [hookPlugin]);
      expect(spawnMock).not.toHaveBeenCalled();
    });

    it('should skip plugins without serverCommand', async () => {
      const plugin = createMcpPlugin({ serverCommand: undefined });
      await service.startServersForFeature('feature-1', [plugin]);
      expect(spawnMock).not.toHaveBeenCalled();
    });

    it('should spawn multiple plugins for a feature', async () => {
      const plugin1 = createMcpPlugin({ name: 'plugin-a', id: 'a' });
      const plugin2 = createMcpPlugin({
        name: 'plugin-b',
        id: 'b',
        serverCommand: 'python',
        serverArgs: ['-m', 'server'],
      });

      const fakeProcess2 = createFakeProcess(99999);
      spawnMock.mockReturnValueOnce(fakeProcess).mockReturnValueOnce(fakeProcess2);

      await service.startServersForFeature('feature-1', [plugin1, plugin2]);
      expect(spawnMock).toHaveBeenCalledTimes(2);
    });

    it('should increment reference count for shared servers across features', async () => {
      const plugin = createMcpPlugin();
      await service.startServersForFeature('feature-1', [plugin]);
      await service.startServersForFeature('feature-2', [plugin]);

      // Should only spawn once — second call increments refcount
      expect(spawnMock).toHaveBeenCalledOnce();

      const servers = service.getActiveServers('feature-1');
      expect(servers).toHaveLength(1);
      expect(servers[0].referenceCount).toBe(2);
    });

    it('should pass activeToolGroups via env var for plugins that support them', async () => {
      const plugin = createMcpPlugin({
        activeToolGroups: ['implement', 'test'],
        toolGroups: [
          { name: 'implement', description: 'Code tools' },
          { name: 'test', description: 'Test tools' },
        ],
      });
      await service.startServersForFeature('feature-1', [plugin]);

      const spawnCall = spawnMock.mock.calls[0];
      const spawnOpts = spawnCall[2] as Record<string, unknown>;
      const env = spawnOpts.env as Record<string, string>;
      expect(env).toHaveProperty('CLAUDE_FLOW_TOOL_GROUPS', 'implement,test');
    });
  });

  describe('stopServersForFeature', () => {
    it('should kill process when refcount reaches zero', async () => {
      const plugin = createMcpPlugin();
      await service.startServersForFeature('feature-1', [plugin]);
      await service.stopServersForFeature('feature-1');

      expect(fakeProcess.kill).toHaveBeenCalledWith('SIGTERM');
    });

    it('should not kill process when other features still using it', async () => {
      const plugin = createMcpPlugin();
      await service.startServersForFeature('feature-1', [plugin]);
      await service.startServersForFeature('feature-2', [plugin]);
      await service.stopServersForFeature('feature-1');

      expect(fakeProcess.kill).not.toHaveBeenCalled();

      const servers = service.getActiveServers('feature-2');
      expect(servers).toHaveLength(1);
      expect(servers[0].referenceCount).toBe(1);
    });

    it('should be a no-op for unknown feature IDs', async () => {
      await expect(service.stopServersForFeature('unknown')).resolves.not.toThrow();
    });
  });

  describe('getActiveServers', () => {
    it('should return empty array when no servers for feature', () => {
      const servers = service.getActiveServers('feature-1');
      expect(servers).toEqual([]);
    });

    it('should return active servers for a feature', async () => {
      const plugin = createMcpPlugin();
      await service.startServersForFeature('feature-1', [plugin]);

      const servers = service.getActiveServers('feature-1');
      expect(servers).toHaveLength(1);
      expect(servers[0]).toEqual({
        pluginName: 'test-plugin',
        pid: 12345,
        referenceCount: 1,
      });
    });
  });

  describe('generateMcpConfigPath', () => {
    it('should return null when no active servers for feature', async () => {
      const result = await service.generateMcpConfigPath('feature-1');
      expect(result).toBeNull();
    });

    it('should create a valid JSON file in os.tmpdir()', async () => {
      const plugin = createMcpPlugin();
      await service.startServersForFeature('feature-1', [plugin]);

      const configPath = await service.generateMcpConfigPath('feature-1');
      expect(configPath).toBeTruthy();
      expect(configPath).toContain('shep-mcp-');
      expect(configPath).toContain('feature-1');

      const content = readFileSync(configPath!, 'utf-8');
      const config = JSON.parse(content);
      expect(config).toHaveProperty('mcpServers');
      expect(config.mcpServers).toHaveProperty('test-plugin');
      expect(config.mcpServers['test-plugin']).toEqual({
        type: 'stdio',
        command: 'node',
        args: ['server.js'],
        env: expect.objectContaining({
          PATH: expect.any(String),
        }),
      });
    });

    it('should return same path on repeated calls for same feature', async () => {
      const plugin = createMcpPlugin();
      await service.startServersForFeature('feature-1', [plugin]);

      const path1 = await service.generateMcpConfigPath('feature-1');
      const path2 = await service.generateMcpConfigPath('feature-1');
      expect(path1).toBe(path2);
    });
  });

  describe('stopServersForFeature cleanup', () => {
    it('should delete the temp config file on stop', async () => {
      const plugin = createMcpPlugin();
      await service.startServersForFeature('feature-1', [plugin]);
      const configPath = await service.generateMcpConfigPath('feature-1');
      expect(configPath).toBeTruthy();
      expect(existsSync(configPath!)).toBe(true);

      await service.stopServersForFeature('feature-1');
      expect(existsSync(configPath!)).toBe(false);
    });
  });

  describe('shutdown', () => {
    it('should kill all managed servers', async () => {
      const plugin1 = createMcpPlugin({ name: 'p1', id: 'p1' });
      const plugin2 = createMcpPlugin({ name: 'p2', id: 'p2' });

      const fakeProcess2 = createFakeProcess(99999);
      spawnMock.mockReturnValueOnce(fakeProcess).mockReturnValueOnce(fakeProcess2);

      await service.startServersForFeature('feature-1', [plugin1, plugin2]);
      await service.shutdown();

      expect(fakeProcess.kill).toHaveBeenCalledWith('SIGTERM');
      expect(fakeProcess2.kill).toHaveBeenCalledWith('SIGTERM');
    });
  });
});
