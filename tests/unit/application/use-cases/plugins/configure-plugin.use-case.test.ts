/**
 * ConfigurePluginUseCase Unit Tests
 *
 * Tests for updating plugin configuration (tool groups).
 *
 * TDD Phase: RED-GREEN
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConfigurePluginUseCase } from '@/application/use-cases/plugins/configure-plugin.use-case.js';
import type { IPluginRepository } from '@/application/ports/output/repositories/plugin-repository.interface.js';
import { PluginType, PluginHealthStatus } from '@/domain/generated/output.js';
import type { Plugin } from '@/domain/generated/output.js';

function createMockPlugin(overrides?: Partial<Plugin>): Plugin {
  return {
    id: 'plugin-001',
    name: 'ruflo',
    displayName: 'Ruflo',
    type: PluginType.Mcp,
    enabled: true,
    healthStatus: PluginHealthStatus.Unknown,
    toolGroups: [
      { name: 'implement', description: 'Implementation tools' },
      { name: 'test', description: 'Testing tools' },
      { name: 'memory', description: 'Memory tools' },
      { name: 'flow', description: 'Workflow tools' },
    ],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('ConfigurePluginUseCase', () => {
  let useCase: ConfigurePluginUseCase;
  let mockPluginRepo: IPluginRepository;

  beforeEach(() => {
    mockPluginRepo = {
      create: vi.fn(),
      findById: vi.fn(),
      findByName: vi.fn().mockResolvedValue(createMockPlugin()),
      list: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    };

    useCase = new ConfigurePluginUseCase(mockPluginRepo);
  });

  it('should update activeToolGroups with valid group names', async () => {
    const result = await useCase.execute('ruflo', {
      activeToolGroups: ['implement', 'test'],
    });

    expect(result.activeToolGroups).toEqual(['implement', 'test']);
    expect(mockPluginRepo.update).toHaveBeenCalledWith(
      expect.objectContaining({
        activeToolGroups: ['implement', 'test'],
      })
    );
  });

  it('should throw on invalid tool group name', async () => {
    await expect(
      useCase.execute('ruflo', { activeToolGroups: ['implement', 'invalid-group'] })
    ).rejects.toThrow(/invalid tool group "invalid-group"/i);
  });

  it('should include available groups in error message', async () => {
    await expect(useCase.execute('ruflo', { activeToolGroups: ['nonexistent'] })).rejects.toThrow(
      /implement, test, memory, flow/
    );
  });

  it('should throw when plugin not found', async () => {
    mockPluginRepo.findByName = vi.fn().mockResolvedValue(null);

    await expect(
      useCase.execute('nonexistent', { activeToolGroups: ['implement'] })
    ).rejects.toThrow(/not found/i);
  });

  it('should allow empty activeToolGroups array', async () => {
    const result = await useCase.execute('ruflo', { activeToolGroups: [] });

    expect(result.activeToolGroups).toEqual([]);
  });

  it('should handle plugin with no tool groups defined', async () => {
    mockPluginRepo.findByName = vi
      .fn()
      .mockResolvedValue(createMockPlugin({ toolGroups: undefined }));

    await expect(useCase.execute('ruflo', { activeToolGroups: ['implement'] })).rejects.toThrow(
      /invalid tool group/i
    );
  });

  it('should update the updatedAt timestamp', async () => {
    const oldDate = new Date('2024-01-01');
    mockPluginRepo.findByName = vi.fn().mockResolvedValue(createMockPlugin({ updatedAt: oldDate }));

    const result = await useCase.execute('ruflo', {
      activeToolGroups: ['implement'],
    });

    expect(result.updatedAt.getTime()).toBeGreaterThan(oldDate.getTime());
  });
});
