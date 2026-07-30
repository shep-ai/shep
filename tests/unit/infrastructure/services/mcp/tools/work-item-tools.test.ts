/**
 * Work Item Tools Unit Tests
 *
 * Tests for the project / work-item management MCP tools that let agents
 * drive shep's task management (list projects, list/get/create/update/delete
 * work items). Uses InMemoryTransport + MCP Client for protocol-accurate testing.
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { registerWorkItemTools } from '@/infrastructure/services/mcp/tools/work-item-tools.js';

const mockListProjects = { execute: vi.fn() };
const mockListWorkItems = { execute: vi.fn() };
const mockGetWorkItem = { execute: vi.fn() };
const mockCreateWorkItem = { execute: vi.fn() };
const mockUpdateWorkItem = { execute: vi.fn() };
const mockDeleteWorkItem = { execute: vi.fn() };

const useCasesByName: Record<string, { execute: ReturnType<typeof vi.fn> }> = {
  ListPmProjectsUseCase: mockListProjects,
  ListWorkItemsUseCase: mockListWorkItems,
  GetWorkItemUseCase: mockGetWorkItem,
  CreateWorkItemUseCase: mockCreateWorkItem,
  UpdateWorkItemUseCase: mockUpdateWorkItem,
  DeleteWorkItemUseCase: mockDeleteWorkItem,
};

const mockContainer = {
  resolve: vi.fn().mockImplementation((token: unknown) => {
    const tokenName = typeof token === 'function' ? (token as { name: string }).name : token;
    const useCase = useCasesByName[tokenName as string];
    if (!useCase) {
      throw new Error(`Unknown token: ${String(token)}`);
    }
    return useCase;
  }),
};

function textOf(result: Awaited<ReturnType<Client['callTool']>>): string {
  const content = result.content as { type: string; text: string }[];
  return content[0].text;
}

describe('Work Item Tools', () => {
  let server: McpServer;
  let client: Client;

  beforeEach(async () => {
    vi.clearAllMocks();
    server = new McpServer({ name: 'test', version: '0.0.0' });
    registerWorkItemTools(server, mockContainer as never);

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    client = new Client({ name: 'test-client', version: '0.0.0' });
    await server.connect(serverTransport);
    await client.connect(clientTransport);
  });

  afterEach(async () => {
    await client.close();
    await server.close();
  });

  describe('registerWorkItemTools', () => {
    it('registers all six work-item management tools', async () => {
      const { tools } = await client.listTools();
      const toolNames = tools.map((t) => t.name);
      expect(toolNames).toEqual(
        expect.arrayContaining([
          'list_projects',
          'list_work_items',
          'get_work_item',
          'create_work_item',
          'update_work_item',
          'delete_work_item',
        ])
      );
    });
  });

  describe('list_projects', () => {
    it('returns projects as JSON text content', async () => {
      mockListProjects.execute.mockResolvedValue([
        { id: 'proj-1', name: 'Alpha', identifierPrefix: 'ALPHA' },
      ]);

      const result = await client.callTool({ name: 'list_projects', arguments: {} });

      expect(mockListProjects.execute).toHaveBeenCalled();
      const parsed = JSON.parse(textOf(result));
      expect(parsed).toHaveLength(1);
      expect(parsed[0].id).toBe('proj-1');
    });

    it('returns error when use case fails', async () => {
      mockListProjects.execute.mockRejectedValue(new Error('DB down'));
      const result = await client.callTool({ name: 'list_projects', arguments: {} });
      expect(result.isError).toBe(true);
      expect(textOf(result)).toContain('DB down');
    });
  });

  describe('list_work_items', () => {
    it('passes projectId and filters to the use case', async () => {
      mockListWorkItems.execute.mockResolvedValue([{ id: 'wi-1', title: 'Task one' }]);

      const result = await client.callTool({
        name: 'list_work_items',
        arguments: {
          projectId: 'proj-1',
          searchText: 'login',
          priorities: ['High'],
          stateIds: ['state-1'],
        },
      });

      expect(mockListWorkItems.execute).toHaveBeenCalledWith('proj-1', {
        searchText: 'login',
        priorities: ['High'],
        stateIds: ['state-1'],
      });
      const parsed = JSON.parse(textOf(result));
      expect(parsed[0].id).toBe('wi-1');
    });

    it('omits undefined filter keys', async () => {
      mockListWorkItems.execute.mockResolvedValue([]);
      await client.callTool({
        name: 'list_work_items',
        arguments: { projectId: 'proj-1' },
      });
      expect(mockListWorkItems.execute).toHaveBeenCalledWith('proj-1', {});
    });
  });

  describe('get_work_item', () => {
    it('returns the work item when found', async () => {
      mockGetWorkItem.execute.mockResolvedValue({
        ok: true,
        workItem: { id: 'wi-1', title: 'Task one' },
      });

      const result = await client.callTool({
        name: 'get_work_item',
        arguments: { identifier: 'ALPHA-1' },
      });

      expect(mockGetWorkItem.execute).toHaveBeenCalledWith('ALPHA-1');
      const parsed = JSON.parse(textOf(result));
      expect(parsed.title).toBe('Task one');
    });

    it('returns an MCP error when not found', async () => {
      mockGetWorkItem.execute.mockResolvedValue({ ok: false, error: 'Work item not found: "X"' });

      const result = await client.callTool({
        name: 'get_work_item',
        arguments: { identifier: 'X' },
      });

      expect(result.isError).toBe(true);
      expect(textOf(result)).toContain('Work item not found');
    });
  });

  describe('create_work_item', () => {
    it('creates a work item and returns it', async () => {
      mockCreateWorkItem.execute.mockResolvedValue({
        ok: true,
        workItem: { id: 'wi-new', title: 'New task' },
      });

      const result = await client.callTool({
        name: 'create_work_item',
        arguments: {
          projectId: 'proj-1',
          title: 'New task',
          description: 'details',
          priority: 'High',
        },
      });

      expect(mockCreateWorkItem.execute).toHaveBeenCalledWith({
        projectId: 'proj-1',
        title: 'New task',
        description: 'details',
        priority: 'High',
      });
      const parsed = JSON.parse(textOf(result));
      expect(parsed.id).toBe('wi-new');
    });

    it('returns an MCP error when creation fails', async () => {
      mockCreateWorkItem.execute.mockResolvedValue({ ok: false, error: 'Project not found: "x"' });

      const result = await client.callTool({
        name: 'create_work_item',
        arguments: { projectId: 'x', title: 'T' },
      });

      expect(result.isError).toBe(true);
      expect(textOf(result)).toContain('Project not found');
    });
  });

  describe('update_work_item', () => {
    it('updates fields and reports success', async () => {
      mockUpdateWorkItem.execute.mockResolvedValue({ ok: true });

      const result = await client.callTool({
        name: 'update_work_item',
        arguments: { workItemId: 'wi-1', stateId: 'state-2', priority: 'Low' },
      });

      expect(mockUpdateWorkItem.execute).toHaveBeenCalledWith('wi-1', {
        stateId: 'state-2',
        priority: 'Low',
      });
      expect(result.isError).toBeFalsy();
    });

    it('returns an MCP error when update fails', async () => {
      mockUpdateWorkItem.execute.mockResolvedValue({
        ok: false,
        error: 'Work item not found: "z"',
      });

      const result = await client.callTool({
        name: 'update_work_item',
        arguments: { workItemId: 'z', title: 'nope' },
      });

      expect(result.isError).toBe(true);
      expect(textOf(result)).toContain('Work item not found');
    });
  });

  describe('delete_work_item', () => {
    it('deletes a work item and reports success', async () => {
      mockDeleteWorkItem.execute.mockResolvedValue({ ok: true });

      const result = await client.callTool({
        name: 'delete_work_item',
        arguments: { workItemId: 'wi-1' },
      });

      expect(mockDeleteWorkItem.execute).toHaveBeenCalledWith('wi-1');
      expect(result.isError).toBeFalsy();
    });

    it('returns an MCP error when deletion fails', async () => {
      mockDeleteWorkItem.execute.mockResolvedValue({
        ok: false,
        error: 'Work item not found: "z"',
      });

      const result = await client.callTool({
        name: 'delete_work_item',
        arguments: { workItemId: 'z' },
      });

      expect(result.isError).toBe(true);
      expect(textOf(result)).toContain('Work item not found');
    });
  });
});
