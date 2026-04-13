/**
 * RemovePluginUseCase Unit Tests
 *
 * Tests for removing plugins from the registry.
 *
 * TDD Phase: RED-GREEN
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RemovePluginUseCase } from '@/application/use-cases/plugins/remove-plugin.use-case.js';
import type { IPluginRepository } from '@/application/ports/output/repositories/plugin-repository.interface.js';
import type { IMcpServerManager } from '@/application/ports/output/services/mcp-server-manager.interface.js';
import { PluginType, PluginHealthStatus } from '@/domain/generated/output.js';
import type { Plugin } from '@/domain/generated/output.js';

function createMockPlugin(overrides?: Partial<Plugin>): Plugin {
  return {
    id: 'plugin-001',
    name: 'mempalace',
    displayName: 'MemPalace',
    type: PluginType.Mcp,
    enabled: true,
    healthStatus: PluginHealthStatus.Unknown,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('RemovePluginUseCase', () => {
  let useCase: RemovePluginUseCase;
  let mockPluginRepo: IPluginRepository;
  let mockMcpServerManager: IMcpServerManager;

  beforeEach(() => {
    mockPluginRepo = {
      create: vi.fn(),
      findById: vi.fn(),
      findByName: vi.fn().mockResolvedValue(createMockPlugin()),
      list: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    };

    mockMcpServerManager = {
      startServersForFeature: vi.fn(),
      stopServersForFeature: vi.fn(),
      getActiveServers: vi.fn().mockReturnValue([]),
      generateMcpConfigPath: vi.fn(),
    };

    useCase = new RemovePluginUseCase(mockPluginRepo, mockMcpServerManager);
  });

  it('should remove an existing plugin and return it', async () => {
    const result = await useCase.execute('mempalace');

    expect(result.name).toBe('mempalace');
    expect(mockPluginRepo.delete).toHaveBeenCalledWith('plugin-001');
  });

  it('should throw when plugin not found', async () => {
    mockPluginRepo.findByName = vi.fn().mockResolvedValue(null);

    await expect(useCase.execute('nonexistent')).rejects.toThrow(/not found/i);
  });

  it('should include plugin name in not found error', async () => {
    mockPluginRepo.findByName = vi.fn().mockResolvedValue(null);

    await expect(useCase.execute('my-tool')).rejects.toThrow('my-tool');
  });
});
