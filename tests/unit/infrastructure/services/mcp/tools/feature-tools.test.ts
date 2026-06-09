/**
 * Feature Tools Unit Tests
 *
 * Tests for feature-related MCP tools: list_features, show_feature,
 * create_feature, and start_feature.
 * Uses InMemoryTransport + MCP Client for protocol-accurate testing.
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { registerFeatureTools } from '@/infrastructure/services/mcp/tools/feature-tools.js';
import type { Feature } from '@/domain/generated/output.js';
import { SdlcLifecycle } from '@/domain/generated/output.js';

const mockListFeaturesUseCase = {
  execute: vi.fn(),
};

const mockShowFeatureUseCase = {
  execute: vi.fn(),
};

const mockCreateFeatureUseCase = {
  execute: vi.fn(),
};

const mockStartFeatureUseCase = {
  execute: vi.fn(),
};

const mockContainer = {
  resolve: vi.fn().mockImplementation((token: unknown) => {
    const tokenName = typeof token === 'function' ? (token as { name: string }).name : token;
    if (tokenName === 'ListFeaturesUseCase') {
      return mockListFeaturesUseCase;
    }
    if (tokenName === 'ShowFeatureUseCase') {
      return mockShowFeatureUseCase;
    }
    if (tokenName === 'CreateFeatureUseCase') {
      return mockCreateFeatureUseCase;
    }
    if (tokenName === 'StartFeatureUseCase') {
      return mockStartFeatureUseCase;
    }
    throw new Error(`Unknown token: ${String(token)}`);
  }),
};

describe('Feature Tools', () => {
  let server: McpServer;
  let client: Client;

  beforeEach(async () => {
    vi.clearAllMocks();
    server = new McpServer({ name: 'test', version: '0.0.0' });
    registerFeatureTools(server, mockContainer as never);

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    client = new Client({ name: 'test-client', version: '0.0.0' });
    await server.connect(serverTransport);
    await client.connect(clientTransport);
  });

  afterEach(async () => {
    await client.close();
    await server.close();
  });

  describe('registerFeatureTools', () => {
    it('registers list_features tool', async () => {
      const { tools } = await client.listTools();
      const toolNames = tools.map((t) => t.name);
      expect(toolNames).toContain('list_features');
    });

    it('list_features tool has a description', async () => {
      const { tools } = await client.listTools();
      const tool = tools.find((t) => t.name === 'list_features');
      expect(tool?.description).toBeDefined();
      expect(tool!.description!.length).toBeGreaterThan(0);
    });
  });

  describe('list_features handler', () => {
    it('calls ListFeaturesUseCase.execute() with empty filters when no params provided', async () => {
      mockListFeaturesUseCase.execute.mockResolvedValue([]);

      await client.callTool({ name: 'list_features', arguments: {} });

      expect(mockListFeaturesUseCase.execute).toHaveBeenCalledWith({});
    });

    it('passes lifecycle filter when status is provided', async () => {
      mockListFeaturesUseCase.execute.mockResolvedValue([]);

      await client.callTool({
        name: 'list_features',
        arguments: { status: 'Implementation' },
      });

      expect(mockListFeaturesUseCase.execute).toHaveBeenCalledWith({
        lifecycle: SdlcLifecycle.Implementation,
      });
    });

    it('returns successful result as JSON text content', async () => {
      const mockFeatures: Partial<Feature>[] = [
        { id: 'feat-1', name: 'Feature One' },
        { id: 'feat-2', name: 'Feature Two' },
      ];
      mockListFeaturesUseCase.execute.mockResolvedValue(mockFeatures);

      const result = await client.callTool({ name: 'list_features', arguments: {} });

      expect(result.content).toBeDefined();
      const textContent = result.content as { type: string; text: string }[];
      expect(textContent[0].type).toBe('text');
      const parsed = JSON.parse(textContent[0].text);
      expect(parsed).toHaveLength(2);
      expect(parsed[0].id).toBe('feat-1');
    });

    it('returns use case error as MCP error response with isError: true', async () => {
      mockListFeaturesUseCase.execute.mockRejectedValue(new Error('Database connection failed'));

      const result = await client.callTool({ name: 'list_features', arguments: {} });

      expect(result.isError).toBe(true);
      const textContent = result.content as { type: string; text: string }[];
      expect(textContent[0].type).toBe('text');
      expect(textContent[0].text).toContain('Database connection failed');
    });
  });

  describe('show_feature handler', () => {
    it('registers show_feature tool', async () => {
      const { tools } = await client.listTools();
      const toolNames = tools.map((t) => t.name);
      expect(toolNames).toContain('show_feature');
    });

    it('calls ShowFeatureUseCase with featureId', async () => {
      const mockFeature: Partial<Feature> = { id: 'abc-123', name: 'Test Feature' };
      mockShowFeatureUseCase.execute.mockResolvedValue(mockFeature);

      await client.callTool({ name: 'show_feature', arguments: { featureId: 'abc-123' } });

      expect(mockShowFeatureUseCase.execute).toHaveBeenCalledWith('abc-123');
    });

    it('returns feature data as JSON text content', async () => {
      const mockFeature: Partial<Feature> = { id: 'abc-123', name: 'Test Feature' };
      mockShowFeatureUseCase.execute.mockResolvedValue(mockFeature);

      const result = await client.callTool({
        name: 'show_feature',
        arguments: { featureId: 'abc-123' },
      });

      const textContent = result.content as { type: string; text: string }[];
      expect(textContent[0].type).toBe('text');
      const parsed = JSON.parse(textContent[0].text);
      expect(parsed.id).toBe('abc-123');
      expect(parsed.name).toBe('Test Feature');
    });

    it('returns error when feature not found', async () => {
      mockShowFeatureUseCase.execute.mockRejectedValue(
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
  });

  describe('create_feature handler', () => {
    it('registers create_feature tool', async () => {
      const { tools } = await client.listTools();
      const toolNames = tools.map((t) => t.name);
      expect(toolNames).toContain('create_feature');
    });

    it('calls CreateFeatureUseCase with userInput and repositoryPath', async () => {
      const mockResult = {
        feature: { id: 'new-feat', name: 'New Feature' },
      };
      mockCreateFeatureUseCase.execute.mockResolvedValue(mockResult);

      await client.callTool({
        name: 'create_feature',
        arguments: {
          userInput: 'Add dark mode support',
          repositoryPath: '/path/to/repo',
        },
      });

      expect(mockCreateFeatureUseCase.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          userInput: 'Add dark mode support',
          repositoryPath: '/path/to/repo',
        })
      );
    });

    it('passes optional name and description to use case', async () => {
      const mockResult = {
        feature: { id: 'new-feat', name: 'Dark Mode' },
      };
      mockCreateFeatureUseCase.execute.mockResolvedValue(mockResult);

      await client.callTool({
        name: 'create_feature',
        arguments: {
          userInput: 'Add dark mode support',
          repositoryPath: '/path/to/repo',
          name: 'Dark Mode',
          description: 'Toggle between light and dark themes',
        },
      });

      expect(mockCreateFeatureUseCase.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          userInput: 'Add dark mode support',
          repositoryPath: '/path/to/repo',
          name: 'Dark Mode',
          description: 'Toggle between light and dark themes',
        })
      );
    });

    it('returns created feature as JSON text content', async () => {
      const mockResult = {
        feature: { id: 'new-feat', name: 'New Feature' },
      };
      mockCreateFeatureUseCase.execute.mockResolvedValue(mockResult);

      const result = await client.callTool({
        name: 'create_feature',
        arguments: {
          userInput: 'Add dark mode',
          repositoryPath: '/path/to/repo',
        },
      });

      const textContent = result.content as { type: string; text: string }[];
      expect(textContent[0].type).toBe('text');
      const parsed = JSON.parse(textContent[0].text);
      expect(parsed.feature.id).toBe('new-feat');
    });

    it('returns error when creation fails', async () => {
      mockCreateFeatureUseCase.execute.mockRejectedValue(new Error('Repository not found'));

      const result = await client.callTool({
        name: 'create_feature',
        arguments: {
          userInput: 'Add dark mode',
          repositoryPath: '/nonexistent',
        },
      });

      expect(result.isError).toBe(true);
      const textContent = result.content as { type: string; text: string }[];
      expect(textContent[0].text).toContain('Repository not found');
    });
  });

  describe('start_feature handler', () => {
    it('registers start_feature tool', async () => {
      const { tools } = await client.listTools();
      const toolNames = tools.map((t) => t.name);
      expect(toolNames).toContain('start_feature');
    });

    it('calls StartFeatureUseCase with featureId', async () => {
      const mockResult = {
        feature: { id: 'feat-1', name: 'Test' },
        agentRun: { id: 'run-abc' },
      };
      mockStartFeatureUseCase.execute.mockResolvedValue(mockResult);

      await client.callTool({
        name: 'start_feature',
        arguments: { featureId: 'feat-1' },
      });

      expect(mockStartFeatureUseCase.execute).toHaveBeenCalledWith('feat-1');
    });

    it('returns result with run ID as JSON text content', async () => {
      const mockResult = {
        feature: { id: 'feat-1', name: 'Test' },
        agentRun: { id: 'run-abc' },
      };
      mockStartFeatureUseCase.execute.mockResolvedValue(mockResult);

      const result = await client.callTool({
        name: 'start_feature',
        arguments: { featureId: 'feat-1' },
      });

      const textContent = result.content as { type: string; text: string }[];
      expect(textContent[0].type).toBe('text');
      const parsed = JSON.parse(textContent[0].text);
      expect(parsed.agentRun.id).toBe('run-abc');
    });

    it('returns error when feature cannot be started', async () => {
      mockStartFeatureUseCase.execute.mockRejectedValue(
        new Error('Feature is not in Pending state')
      );

      const result = await client.callTool({
        name: 'start_feature',
        arguments: { featureId: 'feat-1' },
      });

      expect(result.isError).toBe(true);
      const textContent = result.content as { type: string; text: string }[];
      expect(textContent[0].text).toContain('Feature is not in Pending state');
    });
  });
});
