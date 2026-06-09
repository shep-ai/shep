/**
 * EnablePluginUseCase & DisablePluginUseCase Unit Tests
 *
 * Tests for toggling plugin enabled state.
 *
 * TDD Phase: RED-GREEN
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EnablePluginUseCase } from '@/application/use-cases/plugins/enable-plugin.use-case.js';
import { DisablePluginUseCase } from '@/application/use-cases/plugins/disable-plugin.use-case.js';
import type { IPluginRepository } from '@/application/ports/output/repositories/plugin-repository.interface.js';
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

describe('EnablePluginUseCase', () => {
  let useCase: EnablePluginUseCase;
  let mockPluginRepo: IPluginRepository;

  beforeEach(() => {
    mockPluginRepo = {
      create: vi.fn(),
      findById: vi.fn(),
      findByName: vi.fn().mockResolvedValue(createMockPlugin({ enabled: false })),
      list: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    };

    useCase = new EnablePluginUseCase(mockPluginRepo);
  });

  it('should enable a disabled plugin and return enabled=true', async () => {
    const result = await useCase.execute('mempalace');

    expect(result.enabled).toBe(true);
    expect(mockPluginRepo.update).toHaveBeenCalledWith(expect.objectContaining({ enabled: true }));
  });

  it('should update the updatedAt timestamp', async () => {
    const oldDate = new Date('2024-01-01');
    mockPluginRepo.findByName = vi
      .fn()
      .mockResolvedValue(createMockPlugin({ enabled: false, updatedAt: oldDate }));

    const result = await useCase.execute('mempalace');
    expect(result.updatedAt.getTime()).toBeGreaterThan(oldDate.getTime());
  });

  it('should throw when plugin not found', async () => {
    mockPluginRepo.findByName = vi.fn().mockResolvedValue(null);

    await expect(useCase.execute('nonexistent')).rejects.toThrow(/not found/i);
  });
});

describe('DisablePluginUseCase', () => {
  let useCase: DisablePluginUseCase;
  let mockPluginRepo: IPluginRepository;

  beforeEach(() => {
    mockPluginRepo = {
      create: vi.fn(),
      findById: vi.fn(),
      findByName: vi.fn().mockResolvedValue(createMockPlugin({ enabled: true })),
      list: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    };

    useCase = new DisablePluginUseCase(mockPluginRepo);
  });

  it('should disable an enabled plugin and return enabled=false', async () => {
    const result = await useCase.execute('mempalace');

    expect(result.enabled).toBe(false);
    expect(mockPluginRepo.update).toHaveBeenCalledWith(expect.objectContaining({ enabled: false }));
  });

  it('should update the updatedAt timestamp', async () => {
    const oldDate = new Date('2024-01-01');
    mockPluginRepo.findByName = vi
      .fn()
      .mockResolvedValue(createMockPlugin({ enabled: true, updatedAt: oldDate }));

    const result = await useCase.execute('mempalace');
    expect(result.updatedAt.getTime()).toBeGreaterThan(oldDate.getTime());
  });

  it('should throw when plugin not found', async () => {
    mockPluginRepo.findByName = vi.fn().mockResolvedValue(null);

    await expect(useCase.execute('nonexistent')).rejects.toThrow(/not found/i);
  });
});
