/**
 * PluginHealthCheckerService Unit Tests
 *
 * Tests for multi-tier plugin health verification.
 * Uses direct property injection for the execFileAsync dependency.
 *
 * TDD Phase: RED-GREEN
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PluginHealthCheckerService } from '@/infrastructure/services/plugin/plugin-health-checker.service.js';
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
    runtimeType: 'python',
    runtimeMinVersion: '3.9',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('PluginHealthCheckerService', () => {
  let service: PluginHealthCheckerService;
  let mockExecFileAsync: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockExecFileAsync = vi.fn();
    service = new PluginHealthCheckerService();
    // Inject mock execFile for testing (avoids complex module mocking)
    (service as unknown as { execFileAsync: typeof mockExecFileAsync }).execFileAsync =
      mockExecFileAsync;
  });

  describe('checkHealth', () => {
    it('should return Healthy when runtime and env vars are present', async () => {
      mockExecFileAsync.mockResolvedValue({ stdout: '/usr/bin/python3\n' });

      const plugin = createMockPlugin({ requiredEnvVars: [] });
      const result = await service.checkHealth(plugin);

      expect(result.status).toBe(PluginHealthStatus.Healthy);
      expect(result.pluginName).toBe('mempalace');
    });

    it('should return Unavailable when runtime is missing', async () => {
      mockExecFileAsync.mockRejectedValue(new Error('not found'));

      const plugin = createMockPlugin();
      const result = await service.checkHealth(plugin);

      expect(result.status).toBe(PluginHealthStatus.Unavailable);
      expect(result.message).toMatch(/python/i);
    });

    it('should return Degraded when required env var is missing', async () => {
      mockExecFileAsync.mockResolvedValue({ stdout: '/usr/bin/node\n' });

      const originalValue = process.env.ANTHROPIC_API_KEY;
      delete process.env.ANTHROPIC_API_KEY;

      try {
        const plugin = createMockPlugin({
          name: 'ruflo',
          runtimeType: 'node',
          requiredEnvVars: ['ANTHROPIC_API_KEY'],
        });
        const result = await service.checkHealth(plugin);

        expect(result.status).toBe(PluginHealthStatus.Degraded);
        expect(result.message).toMatch(/ANTHROPIC_API_KEY/);
      } finally {
        if (originalValue !== undefined) {
          process.env.ANTHROPIC_API_KEY = originalValue;
        }
      }
    });

    it('should return Healthy when no runtime type is specified', async () => {
      const plugin = createMockPlugin({ runtimeType: undefined });
      const result = await service.checkHealth(plugin);

      expect(result.status).toBe(PluginHealthStatus.Healthy);
    });

    it('should return Healthy when env vars are all present', async () => {
      mockExecFileAsync.mockResolvedValue({ stdout: '/usr/bin/node\n' });

      const key = '__TEST_PLUGIN_VAR__';
      process.env[key] = 'test-value';

      try {
        const plugin = createMockPlugin({
          runtimeType: 'node',
          requiredEnvVars: [key],
        });
        const result = await service.checkHealth(plugin);

        expect(result.status).toBe(PluginHealthStatus.Healthy);
      } finally {
        delete process.env[key];
      }
    });
  });

  describe('checkAllHealth', () => {
    it('should check health of each plugin and return results', async () => {
      mockExecFileAsync.mockResolvedValue({ stdout: '/usr/bin/python3\n' });

      const plugins = [
        createMockPlugin({ name: 'plugin-a' }),
        createMockPlugin({ name: 'plugin-b' }),
      ];

      const results = await service.checkAllHealth(plugins);

      expect(results).toHaveLength(2);
      expect(results[0].pluginName).toBe('plugin-a');
      expect(results[1].pluginName).toBe('plugin-b');
    });

    it('should return empty array for empty input', async () => {
      const results = await service.checkAllHealth([]);
      expect(results).toEqual([]);
    });
  });
});
