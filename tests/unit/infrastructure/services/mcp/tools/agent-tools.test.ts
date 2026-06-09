/**
 * Agent Tools Unit Tests
 *
 * Tests for agent-related MCP tools: run_agent, show_agent_run,
 * list_agent_runs, and stop_agent_run.
 * Uses InMemoryTransport + MCP Client for protocol-accurate testing.
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { registerAgentTools } from '@/infrastructure/services/mcp/tools/agent-tools.js';

const mockRunAgentUseCase = {
  execute: vi.fn(),
};

const mockGetAgentRunUseCase = {
  execute: vi.fn(),
};

const mockListAgentRunsUseCase = {
  execute: vi.fn(),
};

const mockStopAgentRunUseCase = {
  execute: vi.fn(),
};

const mockContainer = {
  resolve: vi.fn().mockImplementation((token: unknown) => {
    const tokenName = typeof token === 'function' ? (token as { name: string }).name : token;
    if (tokenName === 'RunAgentUseCase') {
      return mockRunAgentUseCase;
    }
    if (tokenName === 'GetAgentRunUseCase') {
      return mockGetAgentRunUseCase;
    }
    if (tokenName === 'ListAgentRunsUseCase') {
      return mockListAgentRunsUseCase;
    }
    if (tokenName === 'StopAgentRunUseCase') {
      return mockStopAgentRunUseCase;
    }
    throw new Error(`Unknown token: ${String(token)}`);
  }),
};

describe('Agent Tools', () => {
  let server: McpServer;
  let client: Client;

  beforeEach(async () => {
    vi.clearAllMocks();
    server = new McpServer({ name: 'test', version: '0.0.0' });
    registerAgentTools(server, mockContainer as never);

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    client = new Client({ name: 'test-client', version: '0.0.0' });
    await server.connect(serverTransport);
    await client.connect(clientTransport);
  });

  afterEach(async () => {
    await client.close();
    await server.close();
  });

  describe('registerAgentTools', () => {
    it('registers all four agent tools', async () => {
      const { tools } = await client.listTools();
      const toolNames = tools.map((t) => t.name);
      expect(toolNames).toContain('run_agent');
      expect(toolNames).toContain('show_agent_run');
      expect(toolNames).toContain('list_agent_runs');
      expect(toolNames).toContain('stop_agent_run');
    });
  });

  describe('run_agent handler', () => {
    it('calls RunAgentUseCase with agentName and prompt', async () => {
      const mockRun = { id: 'run-123', status: 'running' };
      mockRunAgentUseCase.execute.mockResolvedValue(mockRun);

      await client.callTool({
        name: 'run_agent',
        arguments: { agentName: 'code-agent', prompt: 'Fix the bug' },
      });

      expect(mockRunAgentUseCase.execute).toHaveBeenCalledWith({
        agentName: 'code-agent',
        prompt: 'Fix the bug',
      });
    });

    it('returns agent run data as JSON text content', async () => {
      const mockRun = { id: 'run-123', status: 'running' };
      mockRunAgentUseCase.execute.mockResolvedValue(mockRun);

      const result = await client.callTool({
        name: 'run_agent',
        arguments: { agentName: 'code-agent', prompt: 'Fix the bug' },
      });

      const textContent = result.content as { type: string; text: string }[];
      expect(textContent[0].type).toBe('text');
      const parsed = JSON.parse(textContent[0].text);
      expect(parsed.id).toBe('run-123');
    });

    it('returns error when agent is unknown', async () => {
      mockRunAgentUseCase.execute.mockRejectedValue(new Error('Agent not found: "unknown-agent"'));

      const result = await client.callTool({
        name: 'run_agent',
        arguments: { agentName: 'unknown-agent', prompt: 'Do something' },
      });

      expect(result.isError).toBe(true);
      const textContent = result.content as { type: string; text: string }[];
      expect(textContent[0].text).toContain('Agent not found');
    });
  });

  describe('show_agent_run handler', () => {
    it('calls GetAgentRunUseCase with runId', async () => {
      const mockRun = { id: 'run-456', status: 'completed' };
      mockGetAgentRunUseCase.execute.mockResolvedValue(mockRun);

      await client.callTool({
        name: 'show_agent_run',
        arguments: { runId: 'run-456' },
      });

      expect(mockGetAgentRunUseCase.execute).toHaveBeenCalledWith('run-456');
    });

    it('returns agent run details as JSON text content', async () => {
      const mockRun = { id: 'run-456', status: 'completed', agentName: 'code-agent' };
      mockGetAgentRunUseCase.execute.mockResolvedValue(mockRun);

      const result = await client.callTool({
        name: 'show_agent_run',
        arguments: { runId: 'run-456' },
      });

      const textContent = result.content as { type: string; text: string }[];
      const parsed = JSON.parse(textContent[0].text);
      expect(parsed.id).toBe('run-456');
      expect(parsed.status).toBe('completed');
    });

    it('returns error when run not found', async () => {
      mockGetAgentRunUseCase.execute.mockResolvedValue(null);

      const result = await client.callTool({
        name: 'show_agent_run',
        arguments: { runId: 'nonexistent' },
      });

      expect(result.isError).toBe(true);
      const textContent = result.content as { type: string; text: string }[];
      expect(textContent[0].text).toContain('Agent run not found');
    });
  });

  describe('list_agent_runs handler', () => {
    it('calls ListAgentRunsUseCase.execute()', async () => {
      mockListAgentRunsUseCase.execute.mockResolvedValue([]);

      await client.callTool({ name: 'list_agent_runs', arguments: {} });

      expect(mockListAgentRunsUseCase.execute).toHaveBeenCalled();
    });

    it('returns agent runs as JSON text content', async () => {
      const mockRuns = [
        { id: 'run-1', status: 'completed' },
        { id: 'run-2', status: 'running' },
      ];
      mockListAgentRunsUseCase.execute.mockResolvedValue(mockRuns);

      const result = await client.callTool({ name: 'list_agent_runs', arguments: {} });

      const textContent = result.content as { type: string; text: string }[];
      const parsed = JSON.parse(textContent[0].text);
      expect(parsed).toHaveLength(2);
      expect(parsed[0].id).toBe('run-1');
    });

    it('returns error when use case fails', async () => {
      mockListAgentRunsUseCase.execute.mockRejectedValue(new Error('Database error'));

      const result = await client.callTool({ name: 'list_agent_runs', arguments: {} });

      expect(result.isError).toBe(true);
      const textContent = result.content as { type: string; text: string }[];
      expect(textContent[0].text).toContain('Database error');
    });
  });

  describe('stop_agent_run handler', () => {
    it('calls StopAgentRunUseCase with runId', async () => {
      mockStopAgentRunUseCase.execute.mockResolvedValue({
        stopped: true,
        reason: 'User requested',
      });

      await client.callTool({
        name: 'stop_agent_run',
        arguments: { runId: 'run-789' },
      });

      expect(mockStopAgentRunUseCase.execute).toHaveBeenCalledWith('run-789');
    });

    it('returns stop result as JSON text content', async () => {
      mockStopAgentRunUseCase.execute.mockResolvedValue({
        stopped: true,
        reason: 'User requested',
      });

      const result = await client.callTool({
        name: 'stop_agent_run',
        arguments: { runId: 'run-789' },
      });

      const textContent = result.content as { type: string; text: string }[];
      const parsed = JSON.parse(textContent[0].text);
      expect(parsed.stopped).toBe(true);
      expect(parsed.reason).toBe('User requested');
    });

    it('returns error when stop fails', async () => {
      mockStopAgentRunUseCase.execute.mockRejectedValue(
        new Error('Run is already in terminal state')
      );

      const result = await client.callTool({
        name: 'stop_agent_run',
        arguments: { runId: 'run-789' },
      });

      expect(result.isError).toBe(true);
      const textContent = result.content as { type: string; text: string }[];
      expect(textContent[0].text).toContain('terminal state');
    });
  });
});
