/**
 * Agent activity MCP tools (spec 149): read a feature's activity, wait until
 * it needs someone, and act on it — decide its gate or answer its question.
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { registerAgentActivityTools } from '@/infrastructure/services/mcp/tools/agent-activity-tools.js';
import {
  ActivityWaitOutcome,
  AgentActivityState,
  DecisionSurface,
  FeatureConsoleAction,
  FeatureReplyOutcome,
} from '@/domain/generated/output.js';

const get = { execute: vi.fn() };
const wait = { execute: vi.fn() };
const reply = { execute: vi.fn() };

const mockContainer = {
  resolve: vi.fn().mockImplementation((token: unknown) => {
    const name = typeof token === 'function' ? (token as { name: string }).name : token;
    if (name === 'GetAgentActivityUseCase') return get;
    if (name === 'WaitForAgentActivityUseCase') return wait;
    if (name === 'ReplyToFeatureUseCase') return reply;
    throw new Error(`Unknown token: ${String(token)}`);
  }),
};

describe('agent activity MCP tools', () => {
  let server: McpServer;
  let client: Client;

  beforeEach(async () => {
    vi.clearAllMocks();
    server = new McpServer({ name: 'test', version: '0.0.0' });
    registerAgentActivityTools(server, mockContainer as never);
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    client = new Client({ name: 'test-client', version: '0.0.0' });
    await server.connect(serverTransport);
    await client.connect(clientTransport);
  });

  afterEach(async () => {
    await client.close();
    await server.close();
  });

  it('lists all four tools', async () => {
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name)).toEqual(
      expect.arrayContaining([
        'get_agent_activity',
        'wait_for_agent_activity',
        'decide_feature_gate',
        'answer_agent_question',
      ])
    );
  });

  it('get_agent_activity passes its filters and returns the snapshot as JSON', async () => {
    get.execute.mockResolvedValue({ activities: [{ featureId: 'f1' }], overall: 'working' });

    const result = await client.callTool({
      name: 'get_agent_activity',
      arguments: { featureId: 'f1', includeSettled: true },
    });

    expect(get.execute).toHaveBeenCalledWith({ featureId: 'f1', includeSettled: true });
    expect(result.isError).toBeFalsy();
    expect(JSON.stringify(result.content)).toContain('f1');
  });

  it('wait_for_agent_activity waits with a default limit and returns the outcome', async () => {
    wait.execute.mockResolvedValue({
      outcome: ActivityWaitOutcome.Matched,
      activity: { featureId: 'f1', state: AgentActivityState.Blocked },
    });

    const result = await client.callTool({
      name: 'wait_for_agent_activity',
      arguments: { featureId: 'f1', until: ['blocked'] },
    });

    expect(wait.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        featureId: 'f1',
        until: [AgentActivityState.Blocked],
        timeoutMs: 60_000,
      })
    );
    expect(result.isError).toBeFalsy();
    expect(JSON.stringify(result.content)).toContain('matched');
  });

  it('wait_for_agent_activity caps the limit and reports a missing feature as an error', async () => {
    wait.execute.mockResolvedValue({ outcome: ActivityWaitOutcome.NotFound });

    const result = await client.callTool({
      name: 'wait_for_agent_activity',
      arguments: { featureId: 'nope', timeoutMs: 24 * 60 * 60_000 },
    });

    expect(wait.execute).toHaveBeenCalledWith(expect.objectContaining({ timeoutMs: 600_000 }));
    expect(result.isError).toBe(true);
  });

  it('decide_feature_gate replies with the decision and feedback', async () => {
    reply.execute.mockResolvedValue({ outcome: FeatureReplyOutcome.Applied, message: 'Sent' });

    const result = await client.callTool({
      name: 'decide_feature_gate',
      arguments: { featureId: 'f1', decision: 'reject', feedback: 'Split it' },
    });

    expect(reply.execute).toHaveBeenCalledWith({
      featureId: 'f1',
      action: FeatureConsoleAction.Reject,
      feedback: 'Split it',
      answeredBy: 'mcp',
      surface: DecisionSurface.Other,
    });
    expect(result.isError).toBeFalsy();
  });

  it('answer_agent_question replies with the answer; a refusal is a tool error', async () => {
    reply.execute.mockResolvedValue({
      outcome: FeatureReplyOutcome.Refused,
      message: 'Login has no open question to answer.',
    });

    const result = await client.callTool({
      name: 'answer_agent_question',
      arguments: { featureId: 'f1', answer: 'Postgres' },
    });

    expect(reply.execute).toHaveBeenCalledWith({
      featureId: 'f1',
      answer: 'Postgres',
      answeredBy: 'mcp',
      surface: DecisionSurface.Other,
    });
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toContain('no open question');
  });
});
