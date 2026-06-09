/**
 * Repository Tools Unit Tests
 *
 * Tests for the list_repositories MCP tool.
 * Uses InMemoryTransport + MCP Client for protocol-accurate testing.
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { registerRepoTools } from '@/infrastructure/services/mcp/tools/repo-tools.js';

const mockListRepositoriesUseCase = {
  execute: vi.fn(),
};

const mockContainer = {
  resolve: vi.fn().mockImplementation((token: unknown) => {
    const tokenName = typeof token === 'function' ? (token as { name: string }).name : token;
    if (tokenName === 'ListRepositoriesUseCase') {
      return mockListRepositoriesUseCase;
    }
    throw new Error(`Unknown token: ${String(token)}`);
  }),
};

describe('Repository Tools', () => {
  let server: McpServer;
  let client: Client;

  beforeEach(async () => {
    vi.clearAllMocks();
    server = new McpServer({ name: 'test', version: '0.0.0' });
    registerRepoTools(server, mockContainer as never);

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    client = new Client({ name: 'test-client', version: '0.0.0' });
    await server.connect(serverTransport);
    await client.connect(clientTransport);
  });

  afterEach(async () => {
    await client.close();
    await server.close();
  });

  describe('registerRepoTools', () => {
    it('registers list_repositories tool', async () => {
      const { tools } = await client.listTools();
      const toolNames = tools.map((t) => t.name);
      expect(toolNames).toContain('list_repositories');
    });
  });

  describe('list_repositories handler', () => {
    it('calls ListRepositoriesUseCase.execute()', async () => {
      mockListRepositoriesUseCase.execute.mockResolvedValue([]);

      await client.callTool({ name: 'list_repositories', arguments: {} });

      expect(mockListRepositoriesUseCase.execute).toHaveBeenCalled();
    });

    it('returns repositories as JSON text content', async () => {
      const mockRepos = [
        { id: 'repo-1', path: '/path/to/repo1', name: 'my-project' },
        { id: 'repo-2', path: '/path/to/repo2', name: 'other-project' },
      ];
      mockListRepositoriesUseCase.execute.mockResolvedValue(mockRepos);

      const result = await client.callTool({ name: 'list_repositories', arguments: {} });

      const textContent = result.content as { type: string; text: string }[];
      expect(textContent[0].type).toBe('text');
      const parsed = JSON.parse(textContent[0].text);
      expect(parsed).toHaveLength(2);
      expect(parsed[0].id).toBe('repo-1');
      expect(parsed[0].path).toBe('/path/to/repo1');
    });

    it('returns error when use case fails', async () => {
      mockListRepositoriesUseCase.execute.mockRejectedValue(new Error('Database error'));

      const result = await client.callTool({ name: 'list_repositories', arguments: {} });

      expect(result.isError).toBe(true);
      const textContent = result.content as { type: string; text: string }[];
      expect(textContent[0].text).toContain('Database error');
    });
  });
});
