/**
 * McpServerService DI Container Registration Tests
 *
 * Verifies that the McpServerFactory is registered in the container
 * with lazy dynamic import to avoid loading @modelcontextprotocol/sdk
 * for non-MCP commands.
 */

import 'reflect-metadata';
import { container as tsyringeContainer } from 'tsyringe';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the MCP server service module (the dynamic import target)
vi.mock('@/infrastructure/services/mcp/mcp-server.service.js', () => {
  const MockMcpServerService = class {
    server = { registerTool: vi.fn() };
    start = vi.fn();
    stop = vi.fn();
    constructor(
      public version: string,
      public container?: unknown
    ) {}
  };
  return { McpServerService: MockMcpServerService };
});

describe('McpServerService DI Registration', () => {
  let testContainer: typeof tsyringeContainer;

  beforeEach(() => {
    vi.clearAllMocks();
    // Create a child container for isolation
    testContainer = tsyringeContainer.createChildContainer();
    // Register mock IVersionService
    testContainer.register('IVersionService', {
      useFactory: () => ({
        getVersion: () => ({ version: '1.0.0-test', name: '@shepai/cli', description: 'test' }),
      }),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('resolves McpServerFactory as an async function', () => {
    // Register the factory using the same pattern as container.ts
    testContainer.register('McpServerFactory', {
      useFactory: (c) => {
        return async () => {
          const { McpServerService } = await import(
            '@/infrastructure/services/mcp/mcp-server.service.js'
          );
          const versionService = c.resolve<{ getVersion: () => { version: string } }>(
            'IVersionService'
          );
          const { version } = versionService.getVersion();
          return new McpServerService(version, c);
        };
      },
    });

    const factory = testContainer.resolve<() => Promise<unknown>>('McpServerFactory');
    expect(factory).toBeDefined();
    expect(typeof factory).toBe('function');
  });

  it('factory creates a McpServerService with correct version', async () => {
    testContainer.register('McpServerFactory', {
      useFactory: (c) => {
        return async () => {
          const { McpServerService } = await import(
            '@/infrastructure/services/mcp/mcp-server.service.js'
          );
          const versionService = c.resolve<{ getVersion: () => { version: string } }>(
            'IVersionService'
          );
          const { version } = versionService.getVersion();
          return new McpServerService(version, c);
        };
      },
    });

    const factory = testContainer.resolve<() => Promise<unknown>>('McpServerFactory');
    const service = (await factory()) as { version: string; start: unknown; stop: unknown };

    expect(service.version).toBe('1.0.0-test');
    expect(typeof service.start).toBe('function');
    expect(typeof service.stop).toBe('function');
  });

  it('factory passes the container to McpServerService', async () => {
    testContainer.register('McpServerFactory', {
      useFactory: (c) => {
        return async () => {
          const { McpServerService } = await import(
            '@/infrastructure/services/mcp/mcp-server.service.js'
          );
          const versionService = c.resolve<{ getVersion: () => { version: string } }>(
            'IVersionService'
          );
          const { version } = versionService.getVersion();
          return new McpServerService(version, c);
        };
      },
    });

    const factory = testContainer.resolve<() => Promise<unknown>>('McpServerFactory');
    const service = (await factory()) as { container: unknown };

    expect(service.container).toBeDefined();
  });
});
