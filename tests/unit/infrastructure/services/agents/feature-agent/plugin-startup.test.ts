import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Plugin } from '@/domain/generated/output.js';
import { PluginType, PluginTransport, PluginHealthStatus } from '@/domain/generated/output.js';
import type { IPluginRepository } from '@/application/ports/output/repositories/plugin-repository.interface.js';
import type { IMcpServerManager } from '@/application/ports/output/services/mcp-server-manager.interface.js';
import {
  startPluginServers,
  stopPluginServers,
} from '@/infrastructure/services/agents/feature-agent/plugin-startup.js';

function makePlugin(overrides: Partial<Plugin> = {}): Plugin {
  return {
    id: 'p-1',
    name: 'test-plugin',
    displayName: 'Test Plugin',
    type: PluginType.Mcp,
    enabled: true,
    healthStatus: PluginHealthStatus.Healthy,
    serverCommand: 'node',
    serverArgs: ['server.js'],
    transport: PluginTransport.Stdio,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function createMockRepo(plugins: Plugin[]): IPluginRepository {
  return {
    create: vi.fn(),
    findById: vi.fn(),
    findByName: vi.fn(),
    list: vi.fn<() => Promise<Plugin[]>>().mockResolvedValue(plugins),
    update: vi.fn(),
    delete: vi.fn(),
  };
}

function createMockMcpManager(): IMcpServerManager {
  return {
    startServersForFeature: vi
      .fn<(id: string, plugins: Plugin[]) => Promise<void>>()
      .mockResolvedValue(undefined),
    stopServersForFeature: vi.fn<(id: string) => Promise<void>>().mockResolvedValue(undefined),
    getActiveServers: vi.fn().mockReturnValue([]),
    generateMcpConfigPath: vi
      .fn<(id: string) => Promise<string | null>>()
      .mockResolvedValue('/tmp/mcp-config.json'),
  };
}

describe('startPluginServers', () => {
  let pluginRepo: IPluginRepository;
  let mcpManager: IMcpServerManager;
  const featureId = 'feat-123';

  beforeEach(() => {
    pluginRepo = createMockRepo([]);
    mcpManager = createMockMcpManager();
  });

  it('starts MCP servers and returns config path when enabled MCP plugins exist', async () => {
    const mcpPlugin = makePlugin({ type: PluginType.Mcp, enabled: true });
    pluginRepo = createMockRepo([mcpPlugin]);

    const result = await startPluginServers(featureId, pluginRepo, mcpManager);

    expect(mcpManager.startServersForFeature).toHaveBeenCalledWith(featureId, [mcpPlugin]);
    expect(mcpManager.generateMcpConfigPath).toHaveBeenCalledWith(featureId);
    expect(result).toBe('/tmp/mcp-config.json');
  });

  it('filters out non-MCP plugins', async () => {
    const hookPlugin = makePlugin({ name: 'hook', type: PluginType.Hook, enabled: true });
    const mcpPlugin = makePlugin({ name: 'mcp', type: PluginType.Mcp, enabled: true });
    pluginRepo = createMockRepo([hookPlugin, mcpPlugin]);

    await startPluginServers(featureId, pluginRepo, mcpManager);

    expect(mcpManager.startServersForFeature).toHaveBeenCalledWith(featureId, [mcpPlugin]);
  });

  it('filters out disabled plugins', async () => {
    const disabledPlugin = makePlugin({ enabled: false });
    pluginRepo = createMockRepo([disabledPlugin]);

    const result = await startPluginServers(featureId, pluginRepo, mcpManager);

    expect(mcpManager.startServersForFeature).not.toHaveBeenCalled();
    expect(result).toBeUndefined();
  });

  it('returns undefined when no MCP plugins exist', async () => {
    pluginRepo = createMockRepo([]);

    const result = await startPluginServers(featureId, pluginRepo, mcpManager);

    expect(mcpManager.startServersForFeature).not.toHaveBeenCalled();
    expect(result).toBeUndefined();
  });

  it('returns undefined and does not throw when startServersForFeature fails', async () => {
    const mcpPlugin = makePlugin({ type: PluginType.Mcp, enabled: true });
    pluginRepo = createMockRepo([mcpPlugin]);
    vi.mocked(mcpManager.startServersForFeature).mockRejectedValue(new Error('spawn failed'));

    const result = await startPluginServers(featureId, pluginRepo, mcpManager);

    expect(result).toBeUndefined();
  });

  it('returns undefined when generateMcpConfigPath returns null', async () => {
    const mcpPlugin = makePlugin({ type: PluginType.Mcp, enabled: true });
    pluginRepo = createMockRepo([mcpPlugin]);
    vi.mocked(mcpManager.generateMcpConfigPath).mockResolvedValue(null);

    const result = await startPluginServers(featureId, pluginRepo, mcpManager);

    expect(mcpManager.startServersForFeature).toHaveBeenCalled();
    expect(result).toBeUndefined();
  });
});

describe('stopPluginServers', () => {
  let mcpManager: IMcpServerManager;
  const featureId = 'feat-123';

  beforeEach(() => {
    mcpManager = createMockMcpManager();
  });

  it('calls stopServersForFeature with the feature ID', async () => {
    await stopPluginServers(featureId, mcpManager);

    expect(mcpManager.stopServersForFeature).toHaveBeenCalledWith(featureId);
  });

  it('does not throw when stopServersForFeature fails', async () => {
    vi.mocked(mcpManager.stopServersForFeature).mockRejectedValue(new Error('cleanup failed'));

    await expect(stopPluginServers(featureId, mcpManager)).resolves.toBeUndefined();
  });
});
