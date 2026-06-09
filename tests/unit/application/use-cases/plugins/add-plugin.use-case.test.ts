/**
 * AddPluginUseCase Unit Tests
 *
 * Tests for adding plugins from catalog and custom configuration.
 *
 * TDD Phase: RED-GREEN
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AddPluginUseCase } from '@/application/use-cases/plugins/add-plugin.use-case.js';
import type { IPluginRepository } from '@/application/ports/output/repositories/plugin-repository.interface.js';
import type { IPluginCatalog } from '@/application/ports/output/services/plugin-catalog.interface.js';
import {
  getCatalogEntries,
  getCatalogEntry,
} from '@/infrastructure/services/plugin/plugin-catalog.js';
import { PluginType, PluginTransport, PluginHealthStatus } from '@/domain/generated/output.js';

describe('AddPluginUseCase', () => {
  let useCase: AddPluginUseCase;
  let mockPluginRepo: IPluginRepository;

  beforeEach(() => {
    mockPluginRepo = {
      create: vi.fn(),
      findById: vi.fn(),
      findByName: vi.fn().mockResolvedValue(null),
      list: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    };

    const mockCatalog: IPluginCatalog = {
      getEntries: getCatalogEntries,
      getEntry: getCatalogEntry,
    };
    useCase = new AddPluginUseCase(mockPluginRepo, mockCatalog);
  });

  describe('catalog-based install', () => {
    it('should create plugin with catalog metadata for mempalace', async () => {
      const result = await useCase.execute('mempalace');

      expect(result.name).toBe('mempalace');
      expect(result.displayName).toBe('MemPalace');
      expect(result.type).toBe(PluginType.Mcp);
      expect(result.installSource).toBe('catalog');
      expect(result.enabled).toBe(true);
      expect(result.healthStatus).toBe(PluginHealthStatus.Unknown);
      expect(result.serverCommand).toBe('python');
      expect(result.serverArgs).toEqual(['-m', 'mempalace.mcp_server']);
      expect(result.transport).toBe(PluginTransport.Stdio);
      expect(result.runtimeType).toBe('python');
      expect(result.runtimeMinVersion).toBe('3.9');
      expect(mockPluginRepo.create).toHaveBeenCalledWith(result);
    });

    it('should throw when catalog plugin not found', async () => {
      await expect(useCase.execute('nonexistent')).rejects.toThrow(/not found in catalog/i);
    });

    it('should throw when plugin already installed', async () => {
      mockPluginRepo.findByName = vi.fn().mockResolvedValue({
        id: 'existing',
        name: 'mempalace',
      });

      await expect(useCase.execute('mempalace')).rejects.toThrow(/already installed/i);
    });

    it('should generate a UUID for the plugin id', async () => {
      const result = await useCase.execute('mempalace');
      expect(result.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    });
  });

  describe('custom plugin install', () => {
    it('should create custom MCP plugin with provided fields', async () => {
      const result = await useCase.execute({
        name: 'my-custom-tool',
        displayName: 'My Custom Tool',
        type: PluginType.Mcp,
        transport: PluginTransport.Stdio,
        serverCommand: 'node',
        serverArgs: ['server.js'],
        requiredEnvVars: ['MY_API_KEY'],
      });

      expect(result.name).toBe('my-custom-tool');
      expect(result.displayName).toBe('My Custom Tool');
      expect(result.type).toBe(PluginType.Mcp);
      expect(result.installSource).toBe('custom');
      expect(result.transport).toBe(PluginTransport.Stdio);
      expect(result.serverCommand).toBe('node');
      expect(result.serverArgs).toEqual(['server.js']);
      expect(result.requiredEnvVars).toEqual(['MY_API_KEY']);
      expect(mockPluginRepo.create).toHaveBeenCalledWith(result);
    });

    it('should default displayName to name when not provided', async () => {
      const result = await useCase.execute({
        name: 'my-tool',
        type: PluginType.Cli,
      });

      expect(result.displayName).toBe('my-tool');
    });

    it('should throw when custom plugin name already exists', async () => {
      mockPluginRepo.findByName = vi.fn().mockResolvedValue({
        id: 'existing',
        name: 'my-tool',
      });

      await expect(useCase.execute({ name: 'my-tool', type: PluginType.Cli })).rejects.toThrow(
        /already installed/i
      );
    });
  });
});
