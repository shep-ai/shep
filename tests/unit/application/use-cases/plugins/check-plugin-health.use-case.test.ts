/**
 * CheckPluginHealthUseCase Unit Tests
 *
 * Tests for running health checks and updating repository status.
 *
 * TDD Phase: RED-GREEN
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CheckPluginHealthUseCase } from '@/application/use-cases/plugins/check-plugin-health.use-case.js';
import type { IPluginRepository } from '@/application/ports/output/repositories/plugin-repository.interface.js';
import type { IPluginHealthChecker } from '@/application/ports/output/services/plugin-health-checker.interface.js';
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

describe('CheckPluginHealthUseCase', () => {
  let useCase: CheckPluginHealthUseCase;
  let mockPluginRepo: IPluginRepository;
  let mockHealthChecker: IPluginHealthChecker;

  beforeEach(() => {
    mockPluginRepo = {
      create: vi.fn(),
      findById: vi.fn(),
      findByName: vi.fn().mockResolvedValue(createMockPlugin()),
      list: vi.fn().mockResolvedValue([]),
      update: vi.fn(),
      delete: vi.fn(),
    };

    mockHealthChecker = {
      checkHealth: vi.fn().mockResolvedValue({
        pluginName: 'mempalace',
        status: PluginHealthStatus.Healthy,
        message: 'All checks passed',
      }),
      checkAllHealth: vi.fn().mockResolvedValue([]),
    };

    useCase = new CheckPluginHealthUseCase(mockPluginRepo, mockHealthChecker);
  });

  describe('single plugin check', () => {
    it('should check health of named plugin and update repo', async () => {
      const results = await useCase.execute('mempalace');

      expect(results).toHaveLength(1);
      expect(results[0].status).toBe(PluginHealthStatus.Healthy);
      expect(results[0].pluginName).toBe('mempalace');

      expect(mockHealthChecker.checkHealth).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'mempalace' })
      );

      expect(mockPluginRepo.update).toHaveBeenCalledWith(
        expect.objectContaining({
          healthStatus: PluginHealthStatus.Healthy,
          healthMessage: 'All checks passed',
        })
      );
    });

    it('should throw when plugin not found', async () => {
      mockPluginRepo.findByName = vi.fn().mockResolvedValue(null);

      await expect(useCase.execute('nonexistent')).rejects.toThrow(/not found/i);
    });

    it('should update repo with degraded status', async () => {
      mockHealthChecker.checkHealth = vi.fn().mockResolvedValue({
        pluginName: 'mempalace',
        status: PluginHealthStatus.Degraded,
        message: 'Missing env var',
      });

      const results = await useCase.execute('mempalace');

      expect(results[0].status).toBe(PluginHealthStatus.Degraded);
      expect(mockPluginRepo.update).toHaveBeenCalledWith(
        expect.objectContaining({
          healthStatus: PluginHealthStatus.Degraded,
        })
      );
    });
  });

  describe('all plugins check', () => {
    it('should check all plugins when no name provided', async () => {
      const plugins = [
        createMockPlugin({ name: 'plugin-a' }),
        createMockPlugin({ name: 'plugin-b' }),
      ];
      mockPluginRepo.list = vi.fn().mockResolvedValue(plugins);
      mockHealthChecker.checkAllHealth = vi.fn().mockResolvedValue([
        { pluginName: 'plugin-a', status: PluginHealthStatus.Healthy, message: 'OK' },
        {
          pluginName: 'plugin-b',
          status: PluginHealthStatus.Unavailable,
          message: 'Runtime missing',
        },
      ]);

      const results = await useCase.execute();

      expect(results).toHaveLength(2);
      expect(mockHealthChecker.checkAllHealth).toHaveBeenCalledWith(plugins);
      expect(mockPluginRepo.update).toHaveBeenCalledTimes(2);
    });

    it('should return empty array when no plugins installed', async () => {
      mockPluginRepo.list = vi.fn().mockResolvedValue([]);

      const results = await useCase.execute();
      expect(results).toEqual([]);
    });
  });
});
