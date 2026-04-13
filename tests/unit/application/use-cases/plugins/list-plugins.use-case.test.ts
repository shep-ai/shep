/**
 * ListPluginsUseCase Unit Tests
 *
 * Tests for listing registered plugins with optional filtering.
 *
 * TDD Phase: RED-GREEN
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ListPluginsUseCase } from '@/application/use-cases/plugins/list-plugins.use-case.js';
import type { IPluginRepository } from '@/application/ports/output/repositories/plugin-repository.interface.js';
import { PluginType, PluginHealthStatus } from '@/domain/generated/output.js';
import type { Plugin } from '@/domain/generated/output.js';

function createMockPlugin(overrides?: Partial<Plugin>): Plugin {
  return {
    id: 'plugin-001',
    name: 'test-plugin',
    displayName: 'Test Plugin',
    type: PluginType.Mcp,
    enabled: true,
    healthStatus: PluginHealthStatus.Unknown,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('ListPluginsUseCase', () => {
  let useCase: ListPluginsUseCase;
  let mockPluginRepo: IPluginRepository;

  beforeEach(() => {
    mockPluginRepo = {
      create: vi.fn(),
      findById: vi.fn(),
      findByName: vi.fn(),
      list: vi.fn().mockResolvedValue([]),
      update: vi.fn(),
      delete: vi.fn(),
    };

    useCase = new ListPluginsUseCase(mockPluginRepo);
  });

  it('should return empty array when no plugins', async () => {
    const result = await useCase.execute();
    expect(result).toEqual([]);
  });

  it('should return all plugins when no filters', async () => {
    const plugins = [
      createMockPlugin({ id: '1', name: 'mempalace' }),
      createMockPlugin({ id: '2', name: 'ruflo' }),
    ];
    mockPluginRepo.list = vi.fn().mockResolvedValue(plugins);

    const result = await useCase.execute();
    expect(result).toHaveLength(2);
  });

  it('should filter by enabled=true', async () => {
    const plugins = [
      createMockPlugin({ id: '1', name: 'enabled-plugin', enabled: true }),
      createMockPlugin({ id: '2', name: 'disabled-plugin', enabled: false }),
    ];
    mockPluginRepo.list = vi.fn().mockResolvedValue(plugins);

    const result = await useCase.execute({ enabled: true });
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('enabled-plugin');
  });

  it('should filter by enabled=false', async () => {
    const plugins = [
      createMockPlugin({ id: '1', name: 'enabled-plugin', enabled: true }),
      createMockPlugin({ id: '2', name: 'disabled-plugin', enabled: false }),
    ];
    mockPluginRepo.list = vi.fn().mockResolvedValue(plugins);

    const result = await useCase.execute({ enabled: false });
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('disabled-plugin');
  });

  it('should filter by plugin type', async () => {
    const plugins = [
      createMockPlugin({ id: '1', name: 'mcp-plugin', type: PluginType.Mcp }),
      createMockPlugin({ id: '2', name: 'hook-plugin', type: PluginType.Hook }),
      createMockPlugin({ id: '3', name: 'cli-plugin', type: PluginType.Cli }),
    ];
    mockPluginRepo.list = vi.fn().mockResolvedValue(plugins);

    const result = await useCase.execute({ type: PluginType.Hook });
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('hook-plugin');
  });

  it('should combine enabled and type filters', async () => {
    const plugins = [
      createMockPlugin({ id: '1', name: 'p1', type: PluginType.Mcp, enabled: true }),
      createMockPlugin({ id: '2', name: 'p2', type: PluginType.Mcp, enabled: false }),
      createMockPlugin({ id: '3', name: 'p3', type: PluginType.Hook, enabled: true }),
    ];
    mockPluginRepo.list = vi.fn().mockResolvedValue(plugins);

    const result = await useCase.execute({ type: PluginType.Mcp, enabled: true });
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('p1');
  });
});
