/**
 * ask_decision MCP tool (spec 134, part 2) — a headless agent asks with a
 * recommendation; the run and feature come from the environment, never from
 * the model.
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import {
  ASK_DECISION_TOOL,
  registerDecisionTools,
} from '@/infrastructure/services/mcp/tools/decision-tools.js';

const execute = vi.fn();
const container = {
  resolve: vi.fn(() => ({ execute })),
};

async function connect(env: Record<string, string | undefined>) {
  const server = new McpServer({ name: 'test', version: '0.0.0' });
  registerDecisionTools(server, container as never, env);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test-client', version: '0.0.0' });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return { client, server };
}

const ARGS = {
  question: 'How should the column be added?',
  header: 'Migration',
  options: [
    { label: 'Online, nullable column', description: 'No lock', recommended: true },
    { label: 'Column with a default', description: 'Rewrites the table' },
  ],
};

describe('ask_decision', () => {
  let client: Client;
  let server: McpServer;

  afterEach(async () => {
    await client?.close();
    await server?.close();
  });

  beforeEach(() => {
    execute.mockReset();
  });

  it('is listed with a description that requires a recommendation', async () => {
    ({ client, server } = await connect({ SHEP_AGENT_RUN_ID: 'run-1', SHEP_FEATURE_ID: 'feat-1' }));
    const { tools } = await client.listTools();
    const tool = tools.find((t) => t.name === ASK_DECISION_TOOL);
    expect(tool?.description).toMatch(/recommended/i);
  });

  it('asks in the run and feature from the environment and returns the answer', async () => {
    execute.mockResolvedValue({
      outcome: 'answered',
      answer: 'Column with a default',
      answeredBy: 'user:web',
      responses: [],
      pickedRecommended: false,
    });
    ({ client, server } = await connect({ SHEP_AGENT_RUN_ID: 'run-1', SHEP_FEATURE_ID: 'feat-1' }));

    const result = await client.callTool({ name: ASK_DECISION_TOOL, arguments: ARGS });

    expect(execute).toHaveBeenCalledWith(
      expect.objectContaining({ featureId: 'feat-1', agentRunId: 'run-1', question: ARGS.question })
    );
    const text = (result.content as { text: string }[])[0].text;
    expect(text).toContain('Column with a default');
    expect(text).toMatch(/answered/i);
  });

  it('tells the agent to proceed with its recommendation when the deadline passed', async () => {
    execute.mockResolvedValue({
      outcome: 'defaulted',
      answer: 'Online, nullable column',
      responses: [],
      pickedRecommended: true,
    });
    ({ client, server } = await connect({ SHEP_AGENT_RUN_ID: 'run-1', SHEP_FEATURE_ID: 'feat-1' }));

    const result = await client.callTool({ name: ASK_DECISION_TOOL, arguments: ARGS });

    const text = (result.content as { text: string }[])[0].text;
    expect(text).toContain('Online, nullable column');
    expect(text).toMatch(/proceed with your recommended option/i);
  });

  it('refuses outside a Shep agent run', async () => {
    ({ client, server } = await connect({}));
    const result = await client.callTool({ name: ASK_DECISION_TOOL, arguments: ARGS });
    expect(result.isError).toBe(true);
    expect(execute).not.toHaveBeenCalled();
  });
});
