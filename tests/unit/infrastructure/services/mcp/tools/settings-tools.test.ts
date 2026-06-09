/**
 * Settings Tools Unit Tests
 *
 * Tests for settings-related MCP tools: get_settings and update_settings.
 * Uses InMemoryTransport + MCP Client for protocol-accurate testing.
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { registerSettingsTools } from '@/infrastructure/services/mcp/tools/settings-tools.js';

const mockLoadSettingsUseCase = {
  execute: vi.fn(),
};

const mockUpdateSettingsUseCase = {
  execute: vi.fn(),
};

const mockContainer = {
  resolve: vi.fn().mockImplementation((token: unknown) => {
    const tokenName = typeof token === 'function' ? (token as { name: string }).name : token;
    if (tokenName === 'LoadSettingsUseCase') {
      return mockLoadSettingsUseCase;
    }
    if (tokenName === 'UpdateSettingsUseCase') {
      return mockUpdateSettingsUseCase;
    }
    throw new Error(`Unknown token: ${String(token)}`);
  }),
};

describe('Settings Tools', () => {
  let server: McpServer;
  let client: Client;

  beforeEach(async () => {
    vi.clearAllMocks();
    server = new McpServer({ name: 'test', version: '0.0.0' });
    registerSettingsTools(server, mockContainer as never);

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    client = new Client({ name: 'test-client', version: '0.0.0' });
    await server.connect(serverTransport);
    await client.connect(clientTransport);
  });

  afterEach(async () => {
    await client.close();
    await server.close();
  });

  describe('registerSettingsTools', () => {
    it('registers both settings tools', async () => {
      const { tools } = await client.listTools();
      const toolNames = tools.map((t) => t.name);
      expect(toolNames).toContain('get_settings');
      expect(toolNames).toContain('update_settings');
    });
  });

  describe('get_settings handler', () => {
    it('calls LoadSettingsUseCase.execute()', async () => {
      const mockSettings = { id: 'settings-1', onboardingComplete: true };
      mockLoadSettingsUseCase.execute.mockResolvedValue(mockSettings);

      await client.callTool({ name: 'get_settings', arguments: {} });

      expect(mockLoadSettingsUseCase.execute).toHaveBeenCalled();
    });

    it('returns settings as JSON text content', async () => {
      const mockSettings = {
        id: 'settings-1',
        onboardingComplete: true,
        agent: { type: 'claude-code' },
      };
      mockLoadSettingsUseCase.execute.mockResolvedValue(mockSettings);

      const result = await client.callTool({ name: 'get_settings', arguments: {} });

      const textContent = result.content as { type: string; text: string }[];
      expect(textContent[0].type).toBe('text');
      const parsed = JSON.parse(textContent[0].text);
      expect(parsed.id).toBe('settings-1');
      expect(parsed.agent.type).toBe('claude-code');
    });

    it('returns error when settings not found', async () => {
      mockLoadSettingsUseCase.execute.mockRejectedValue(new Error('Settings not found'));

      const result = await client.callTool({ name: 'get_settings', arguments: {} });

      expect(result.isError).toBe(true);
      const textContent = result.content as { type: string; text: string }[];
      expect(textContent[0].text).toContain('Settings not found');
    });
  });

  describe('update_settings handler', () => {
    it('calls UpdateSettingsUseCase with provided settings', async () => {
      const updatedSettings = { id: 'settings-1', onboardingComplete: true };
      mockUpdateSettingsUseCase.execute.mockResolvedValue(updatedSettings);

      await client.callTool({
        name: 'update_settings',
        arguments: {
          settings: { onboardingComplete: true },
        },
      });

      expect(mockUpdateSettingsUseCase.execute).toHaveBeenCalledWith({ onboardingComplete: true });
    });

    it('returns updated settings as JSON text content', async () => {
      const updatedSettings = {
        id: 'settings-1',
        onboardingComplete: false,
        agent: { type: 'aider' },
      };
      mockUpdateSettingsUseCase.execute.mockResolvedValue(updatedSettings);

      const result = await client.callTool({
        name: 'update_settings',
        arguments: {
          settings: { agent: { type: 'aider' } },
        },
      });

      const textContent = result.content as { type: string; text: string }[];
      const parsed = JSON.parse(textContent[0].text);
      expect(parsed.agent.type).toBe('aider');
    });

    it('returns error when update fails', async () => {
      mockUpdateSettingsUseCase.execute.mockRejectedValue(new Error('Validation failed'));

      const result = await client.callTool({
        name: 'update_settings',
        arguments: {
          settings: { invalid: 'data' },
        },
      });

      expect(result.isError).toBe(true);
      const textContent = result.content as { type: string; text: string }[];
      expect(textContent[0].text).toContain('Validation failed');
    });
  });
});
