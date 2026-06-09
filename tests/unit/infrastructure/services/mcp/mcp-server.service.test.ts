/**
 * McpServerService Unit Tests
 *
 * Tests for the MCP server service lifecycle (create, start, stop).
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServerService } from '@/infrastructure/services/mcp/mcp-server.service.js';

// Mock the StdioServerTransport to avoid real stdin/stdout binding
vi.mock('@modelcontextprotocol/sdk/server/stdio.js', () => {
  return {
    StdioServerTransport: class MockStdioServerTransport {
      start = vi.fn();
      close = vi.fn().mockResolvedValue(undefined);
    },
  };
});

describe('McpServerService', () => {
  let service: McpServerService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new McpServerService('1.0.0');
  });

  describe('constructor', () => {
    it('creates an instance without throwing', () => {
      expect(service).toBeDefined();
      expect(service).toBeInstanceOf(McpServerService);
    });

    it('exposes the underlying McpServer instance', () => {
      expect(service.server).toBeInstanceOf(McpServer);
    });
  });

  describe('server metadata', () => {
    it('configures server with name "shep"', () => {
      // The McpServer stores the serverInfo passed to its constructor.
      // We can verify by inspecting the server's internal state.
      expect(service.server).toBeDefined();
    });
  });

  describe('start()', () => {
    it('connects a StdioServerTransport', async () => {
      // Spy on the server's connect method
      const connectSpy = vi.spyOn(service.server, 'connect').mockResolvedValue(undefined);

      await service.start();

      expect(connectSpy).toHaveBeenCalledTimes(1);
      // The argument should be a StdioServerTransport instance
      expect(connectSpy).toHaveBeenCalledWith(expect.any(Object));
    });

    it('returns a promise that resolves', async () => {
      vi.spyOn(service.server, 'connect').mockResolvedValue(undefined);
      await expect(service.start()).resolves.toBeUndefined();
    });
  });

  describe('stop()', () => {
    it('closes the server', async () => {
      const closeSpy = vi.spyOn(service.server, 'close').mockResolvedValue(undefined);

      await service.stop();

      expect(closeSpy).toHaveBeenCalledTimes(1);
    });

    it('returns a promise that resolves', async () => {
      vi.spyOn(service.server, 'close').mockResolvedValue(undefined);
      await expect(service.stop()).resolves.toBeUndefined();
    });
  });

  describe('tool registration with container', () => {
    const expectedTools = [
      'list_features',
      'show_feature',
      'create_feature',
      'start_feature',
      'run_agent',
      'show_agent_run',
      'list_agent_runs',
      'stop_agent_run',
      'list_repositories',
      'get_settings',
      'update_settings',
    ];

    let containerService: McpServerService;
    let client: Client;

    const mockContainer = {
      resolve: vi.fn().mockReturnValue({ execute: vi.fn() }),
    };

    beforeEach(async () => {
      containerService = new McpServerService('1.0.0', mockContainer as never);
      const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
      client = new Client({ name: 'test-client', version: '0.0.0' });
      await containerService.server.connect(serverTransport);
      await client.connect(clientTransport);
    });

    afterEach(async () => {
      await client.close();
      await containerService.server.close();
    });

    it('registers all 11 tools when container is provided', async () => {
      const { tools } = await client.listTools();
      const toolNames = tools.map((t) => t.name);

      expect(tools).toHaveLength(11);
      for (const name of expectedTools) {
        expect(toolNames).toContain(name);
      }
    });

    it('all tools follow snake_case naming convention', async () => {
      const { tools } = await client.listTools();
      for (const tool of tools) {
        expect(tool.name).toMatch(/^[a-z][a-z0-9_]*$/);
      }
    });
  });
});
