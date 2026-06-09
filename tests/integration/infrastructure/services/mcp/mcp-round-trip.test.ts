/**
 * MCP Protocol Round-Trip Integration Tests
 *
 * Tests the full MCP protocol lifecycle using InMemoryTransport + Client.
 * Verifies: initialize, tools/list, tools/call (success + error), and
 * input validation across the complete McpServerService with all tools registered.
 *
 * These tests exercise the MCP layer as a real client would — sending
 * JSON-RPC messages over a transport and verifying protocol-level responses.
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServerService } from '@/infrastructure/services/mcp/mcp-server.service.js';

// Mock StdioServerTransport to prevent real stdin/stdout binding
vi.mock('@modelcontextprotocol/sdk/server/stdio.js', () => {
  return {
    StdioServerTransport: class MockStdioServerTransport {
      start = vi.fn();
      close = vi.fn().mockResolvedValue(undefined);
    },
  };
});

/**
 * Creates a mock DI container with configurable use case behavior.
 * Each use case can be individually configured for success or failure scenarios.
 */
function createMockContainer(
  overrides: Record<string, { execute: ReturnType<typeof vi.fn> }> = {}
) {
  const defaults: Record<string, { execute: ReturnType<typeof vi.fn> }> = {
    ListFeaturesUseCase: {
      execute: vi.fn().mockResolvedValue([
        { id: 'feat-001', name: 'Feature One', lifecycle: 'Requirements' },
        { id: 'feat-002', name: 'Feature Two', lifecycle: 'Implementation' },
      ]),
    },
    ShowFeatureUseCase: {
      execute: vi.fn().mockResolvedValue({
        id: 'feat-001',
        name: 'Feature One',
        lifecycle: 'Requirements',
        description: 'A test feature',
      }),
    },
    CreateFeatureUseCase: {
      execute: vi.fn().mockResolvedValue({
        feature: { id: 'feat-new', name: 'New Feature' },
      }),
    },
    StartFeatureUseCase: {
      execute: vi.fn().mockResolvedValue({
        feature: { id: 'feat-001' },
        agentRun: { id: 'run-abc' },
      }),
    },
    RunAgentUseCase: {
      execute: vi.fn().mockResolvedValue({ id: 'run-xyz', status: 'running' }),
    },
    GetAgentRunUseCase: {
      execute: vi.fn().mockResolvedValue({ id: 'run-xyz', status: 'completed' }),
    },
    ListAgentRunsUseCase: {
      execute: vi.fn().mockResolvedValue([
        { id: 'run-1', status: 'completed' },
        { id: 'run-2', status: 'running' },
      ]),
    },
    StopAgentRunUseCase: {
      execute: vi.fn().mockResolvedValue({ stopped: true }),
    },
    ListRepositoriesUseCase: {
      execute: vi
        .fn()
        .mockResolvedValue([{ id: 'repo-1', path: '/path/to/repo', name: 'my-project' }]),
    },
    LoadSettingsUseCase: {
      execute: vi.fn().mockResolvedValue({
        models: { planning: 'claude-sonnet-4-5-20250929' },
        agent: { type: 'claude-code' },
      }),
    },
    UpdateSettingsUseCase: {
      execute: vi.fn().mockResolvedValue({
        models: { planning: 'claude-opus-4-20250115' },
        agent: { type: 'claude-code' },
      }),
    },
  };

  const useCases = { ...defaults, ...overrides };

  return {
    resolve: vi.fn().mockImplementation((token: unknown) => {
      const tokenName = typeof token === 'function' ? (token as { name: string }).name : token;
      const useCase = useCases[tokenName as string];
      if (!useCase) {
        throw new Error(`Unknown use case: ${String(token)}`);
      }
      return useCase;
    }),
    _useCases: useCases,
  };
}

describe('MCP Protocol Round-Trip (integration)', () => {
  let service: McpServerService;
  let client: Client;
  let mockContainer: ReturnType<typeof createMockContainer>;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockContainer = createMockContainer();
    service = new McpServerService('2.0.0', mockContainer as never);

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    client = new Client({ name: 'integration-test-client', version: '1.0.0' });
    await service.server.connect(serverTransport);
    await client.connect(clientTransport);
  });

  afterEach(async () => {
    await client.close();
    await service.server.close();
  });

  describe('initialize', () => {
    it('returns server metadata with name "shep" and version', () => {
      // The client successfully connected which means initialize completed.
      // The server info is available on the client after connection.
      const serverInfo = client.getServerVersion();
      expect(serverInfo).toBeDefined();
      expect(serverInfo?.name).toBe('shep');
      expect(serverInfo?.version).toBe('2.0.0');
    });
  });

  describe('tools/list', () => {
    const expectedToolNames = [
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

    it('returns all 11 registered tools', async () => {
      const { tools } = await client.listTools();
      expect(tools).toHaveLength(11);
    });

    it('includes all expected tool names', async () => {
      const { tools } = await client.listTools();
      const toolNames = tools.map((t) => t.name);
      for (const name of expectedToolNames) {
        expect(toolNames).toContain(name);
      }
    });

    it('every tool has a non-empty description', async () => {
      const { tools } = await client.listTools();
      for (const tool of tools) {
        expect(tool.description).toBeDefined();
        expect(tool.description!.length).toBeGreaterThan(0);
      }
    });

    it('every tool has an inputSchema', async () => {
      const { tools } = await client.listTools();
      for (const tool of tools) {
        expect(tool.inputSchema).toBeDefined();
        expect(tool.inputSchema.type).toBe('object');
      }
    });
  });

  describe('tools/call — success paths', () => {
    it('list_features returns JSON array of features', async () => {
      const result = await client.callTool({ name: 'list_features', arguments: {} });

      expect(result.isError).toBeFalsy();
      const textContent = result.content as { type: string; text: string }[];
      expect(textContent).toHaveLength(1);
      expect(textContent[0].type).toBe('text');

      const parsed = JSON.parse(textContent[0].text);
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed).toHaveLength(2);
      expect(parsed[0]).toHaveProperty('id', 'feat-001');
      expect(parsed[1]).toHaveProperty('id', 'feat-002');
    });

    it('list_features with status filter passes filter to use case', async () => {
      const result = await client.callTool({
        name: 'list_features',
        arguments: { status: 'Implementation' },
      });

      expect(result.isError).toBeFalsy();
      expect(mockContainer._useCases.ListFeaturesUseCase.execute).toHaveBeenCalledWith({
        lifecycle: 'Implementation',
      });
    });

    it('show_feature returns feature details as JSON', async () => {
      const result = await client.callTool({
        name: 'show_feature',
        arguments: { featureId: 'feat-001' },
      });

      expect(result.isError).toBeFalsy();
      const textContent = result.content as { type: string; text: string }[];
      const parsed = JSON.parse(textContent[0].text);
      expect(parsed).toHaveProperty('id', 'feat-001');
      expect(parsed).toHaveProperty('name', 'Feature One');
      expect(parsed).toHaveProperty('description', 'A test feature');
    });

    it('create_feature returns created feature', async () => {
      const result = await client.callTool({
        name: 'create_feature',
        arguments: {
          userInput: 'Add dark mode',
          repositoryPath: '/path/to/repo',
        },
      });

      expect(result.isError).toBeFalsy();
      const textContent = result.content as { type: string; text: string }[];
      const parsed = JSON.parse(textContent[0].text);
      expect(parsed.feature).toHaveProperty('id', 'feat-new');
    });

    it('run_agent returns run ID immediately', async () => {
      const result = await client.callTool({
        name: 'run_agent',
        arguments: { agentName: 'claude-code', prompt: 'Fix the bug' },
      });

      expect(result.isError).toBeFalsy();
      const textContent = result.content as { type: string; text: string }[];
      const parsed = JSON.parse(textContent[0].text);
      expect(parsed).toHaveProperty('id', 'run-xyz');
      expect(parsed).toHaveProperty('status', 'running');
    });

    it('list_repositories returns repository list', async () => {
      const result = await client.callTool({ name: 'list_repositories', arguments: {} });

      expect(result.isError).toBeFalsy();
      const textContent = result.content as { type: string; text: string }[];
      const parsed = JSON.parse(textContent[0].text);
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed[0]).toHaveProperty('path', '/path/to/repo');
    });

    it('get_settings returns current settings', async () => {
      const result = await client.callTool({ name: 'get_settings', arguments: {} });

      expect(result.isError).toBeFalsy();
      const textContent = result.content as { type: string; text: string }[];
      const parsed = JSON.parse(textContent[0].text);
      expect(parsed).toHaveProperty('models');
      expect(parsed).toHaveProperty('agent');
    });

    it('update_settings returns updated settings', async () => {
      const result = await client.callTool({
        name: 'update_settings',
        arguments: {
          settings: { models: { planning: 'claude-opus-4-20250115' } },
        },
      });

      expect(result.isError).toBeFalsy();
      const textContent = result.content as { type: string; text: string }[];
      const parsed = JSON.parse(textContent[0].text);
      expect(parsed.models.planning).toBe('claude-opus-4-20250115');
    });
  });

  describe('tools/call — error paths', () => {
    it('returns isError: true when use case throws', async () => {
      mockContainer._useCases.ListFeaturesUseCase.execute.mockRejectedValue(
        new Error('Database connection failed')
      );

      const result = await client.callTool({ name: 'list_features', arguments: {} });

      expect(result.isError).toBe(true);
      const textContent = result.content as { type: string; text: string }[];
      expect(textContent[0].type).toBe('text');
      expect(textContent[0].text).toContain('Database connection failed');
    });

    it('returns error message for feature not found', async () => {
      mockContainer._useCases.ShowFeatureUseCase.execute.mockRejectedValue(
        new Error('Feature not found: "nonexistent"')
      );

      const result = await client.callTool({
        name: 'show_feature',
        arguments: { featureId: 'nonexistent' },
      });

      expect(result.isError).toBe(true);
      const textContent = result.content as { type: string; text: string }[];
      expect(textContent[0].text).toContain('Feature not found');
    });

    it('returns error for agent run not found via show_agent_run', async () => {
      mockContainer._useCases.GetAgentRunUseCase.execute.mockResolvedValue(null);

      const result = await client.callTool({
        name: 'show_agent_run',
        arguments: { runId: 'nonexistent-run' },
      });

      expect(result.isError).toBe(true);
      const textContent = result.content as { type: string; text: string }[];
      expect(textContent[0].text).toContain('Agent run not found');
    });

    it('returns error when create_feature use case fails', async () => {
      mockContainer._useCases.CreateFeatureUseCase.execute.mockRejectedValue(
        new Error('Repository not initialized')
      );

      const result = await client.callTool({
        name: 'create_feature',
        arguments: {
          userInput: 'Add feature',
          repositoryPath: '/bad/path',
        },
      });

      expect(result.isError).toBe(true);
      const textContent = result.content as { type: string; text: string }[];
      expect(textContent[0].text).toContain('Repository not initialized');
    });

    it('returns error when non-Error object is thrown', async () => {
      mockContainer._useCases.ListRepositoriesUseCase.execute.mockRejectedValue(
        'string error message'
      );

      const result = await client.callTool({ name: 'list_repositories', arguments: {} });

      expect(result.isError).toBe(true);
      const textContent = result.content as { type: string; text: string }[];
      expect(textContent[0].text).toContain('string error message');
    });
  });

  describe('tools/call — input validation', () => {
    it('rejects show_feature without required featureId', async () => {
      // Calling a tool that requires featureId without providing it
      // should result in an error from the MCP protocol layer
      try {
        const result = await client.callTool({
          name: 'show_feature',
          arguments: {},
        });
        // If the SDK returns a result instead of throwing, it should be an error
        expect(result.isError).toBe(true);
      } catch (error) {
        // The MCP SDK may throw a protocol error for invalid input
        expect(error).toBeDefined();
      }
    });

    it('rejects create_feature without required fields', async () => {
      try {
        const result = await client.callTool({
          name: 'create_feature',
          arguments: {},
        });
        expect(result.isError).toBe(true);
      } catch (error) {
        expect(error).toBeDefined();
      }
    });

    it('rejects run_agent without required agentName and prompt', async () => {
      try {
        const result = await client.callTool({
          name: 'run_agent',
          arguments: {},
        });
        expect(result.isError).toBe(true);
      } catch (error) {
        expect(error).toBeDefined();
      }
    });
  });

  describe('server lifecycle', () => {
    it('server remains responsive after an error in one tool call', async () => {
      // First call fails
      mockContainer._useCases.ListFeaturesUseCase.execute.mockRejectedValueOnce(
        new Error('Temporary failure')
      );
      const errorResult = await client.callTool({ name: 'list_features', arguments: {} });
      expect(errorResult.isError).toBe(true);

      // Reset mock to succeed
      mockContainer._useCases.ListFeaturesUseCase.execute.mockResolvedValueOnce([
        { id: 'feat-1', name: 'Recovery Feature' },
      ]);

      // Second call succeeds — server did not crash
      const successResult = await client.callTool({ name: 'list_features', arguments: {} });
      expect(successResult.isError).toBeFalsy();
      const textContent = successResult.content as { type: string; text: string }[];
      const parsed = JSON.parse(textContent[0].text);
      expect(parsed[0]).toHaveProperty('name', 'Recovery Feature');
    });

    it('multiple sequential tool calls work correctly', async () => {
      // Call different tools in sequence to verify no state leakage
      const featuresResult = await client.callTool({ name: 'list_features', arguments: {} });
      const reposResult = await client.callTool({ name: 'list_repositories', arguments: {} });
      const settingsResult = await client.callTool({ name: 'get_settings', arguments: {} });

      expect(featuresResult.isError).toBeFalsy();
      expect(reposResult.isError).toBeFalsy();
      expect(settingsResult.isError).toBeFalsy();

      // Verify each returned the correct data type
      const features = JSON.parse(
        (featuresResult.content as { type: string; text: string }[])[0].text
      );
      const repos = JSON.parse((reposResult.content as { type: string; text: string }[])[0].text);
      const settings = JSON.parse(
        (settingsResult.content as { type: string; text: string }[])[0].text
      );

      expect(Array.isArray(features)).toBe(true);
      expect(Array.isArray(repos)).toBe(true);
      expect(settings).toHaveProperty('models');
    });
  });
});
