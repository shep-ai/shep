/**
 * The decision MCP server a headless run is given (spec 134): it exposes
 * ask_decision and nothing else — a run must not gain Shep's other tools.
 */

import 'reflect-metadata';
import { describe, it, expect } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createDecisionMcpServer } from '@/infrastructure/services/mcp/decision-mcp-server.js';

describe('createDecisionMcpServer', () => {
  it('lists only ask_decision', async () => {
    const server = createDecisionMcpServer({ resolve: () => ({}) } as never, {}, '1.0.0');
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: 'test', version: '0.0.0' });
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name)).toEqual(['ask_decision']);

    await client.close();
    await server.close();
  });
});
