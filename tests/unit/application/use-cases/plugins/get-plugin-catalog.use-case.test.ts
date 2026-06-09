/**
 * GetPluginCatalogUseCase Unit Tests
 *
 * Tests for retrieving the curated catalog with installation status.
 *
 * TDD Phase: RED-GREEN
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GetPluginCatalogUseCase } from '@/application/use-cases/plugins/get-plugin-catalog.use-case.js';
import type { IPluginRepository } from '@/application/ports/output/repositories/plugin-repository.interface.js';
import type { IPluginCatalog } from '@/application/ports/output/services/plugin-catalog.interface.js';
import {
  getCatalogEntries,
  getCatalogEntry,
} from '@/infrastructure/services/plugin/plugin-catalog.js';
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

describe('GetPluginCatalogUseCase', () => {
  let useCase: GetPluginCatalogUseCase;
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

    const mockCatalog: IPluginCatalog = {
      getEntries: getCatalogEntries,
      getEntry: getCatalogEntry,
    };
    useCase = new GetPluginCatalogUseCase(mockPluginRepo, mockCatalog);
  });

  it('should return all catalog entries', async () => {
    const result = await useCase.execute();
    expect(result.length).toBeGreaterThanOrEqual(3);
  });

  it('should mark installed plugin as isInstalled=true', async () => {
    mockPluginRepo.list = vi.fn().mockResolvedValue([createMockPlugin({ name: 'mempalace' })]);

    const result = await useCase.execute();
    const mempalace = result.find((e) => e.name === 'mempalace');
    expect(mempalace?.isInstalled).toBe(true);
  });

  it('should mark uninstalled plugin as isInstalled=false', async () => {
    mockPluginRepo.list = vi.fn().mockResolvedValue([]);

    const result = await useCase.execute();
    const mempalace = result.find((e) => e.name === 'mempalace');
    expect(mempalace?.isInstalled).toBe(false);
  });

  it('should show mixed install status across catalog', async () => {
    mockPluginRepo.list = vi.fn().mockResolvedValue([createMockPlugin({ name: 'ruflo' })]);

    const result = await useCase.execute();
    const ruflo = result.find((e) => e.name === 'ruflo');
    const mempalace = result.find((e) => e.name === 'mempalace');

    expect(ruflo?.isInstalled).toBe(true);
    expect(mempalace?.isInstalled).toBe(false);
  });
});
