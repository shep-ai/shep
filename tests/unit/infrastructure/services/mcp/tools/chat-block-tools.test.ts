/**
 * post_chat_block (spec 137) — the MCP door to PostChatBlockUseCase, for any
 * agent that mounts the shep MCP server.
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { registerChatBlockTools } from '@/infrastructure/services/mcp/tools/chat-block-tools.js';
import { ChatBlockType } from '@/domain/generated/output.js';
import { InvalidChatBlockError } from '@/domain/errors/invalid-chat-block.error.js';

const post = { execute: vi.fn() };

const mockContainer = {
  resolve: vi.fn().mockImplementation((token: unknown) => {
    const name = typeof token === 'function' ? (token as { name: string }).name : token;
    if (name === 'PostChatBlockUseCase') return post;
    throw new Error(`Unknown token: ${String(token)}`);
  }),
};

describe('post_chat_block', () => {
  let server: McpServer;
  let client: Client;

  beforeEach(async () => {
    vi.clearAllMocks();
    server = new McpServer({ name: 'test', version: '0.0.0' });
    registerChatBlockTools(server, mockContainer as never);
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    client = new Client({ name: 'test-client', version: '0.0.0' });
    await server.connect(serverTransport);
    await client.connect(clientTransport);
  });

  afterEach(async () => {
    await client.close();
    await server.close();
  });

  it('is listed', async () => {
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name)).toContain('post_chat_block');
  });

  it('posts the block and returns its id', async () => {
    post.execute.mockResolvedValue({ block: { id: 'block-1' }, message: { id: 'm1' } });

    const result = await client.callTool({
      name: 'post_chat_block',
      arguments: { scope: 'global', type: 'plan_card', title: 'Plan', markdown: '1. Do it' },
    });

    expect(post.execute).toHaveBeenCalledWith({
      scope: 'global',
      type: ChatBlockType.PlanCard,
      title: 'Plan',
      markdown: '1. Do it',
    });
    expect(result.isError).toBeFalsy();
    expect(JSON.stringify(result.content)).toContain('block-1');
  });

  it('returns the validation message as a tool error', async () => {
    post.execute.mockRejectedValue(
      new InvalidChatBlockError('A html_preview block needs html content.')
    );

    const result = await client.callTool({
      name: 'post_chat_block',
      arguments: { scope: 'global', type: 'html_preview', title: 'Card' },
    });

    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toContain('needs html content');
  });
});
