/**
 * A2A interoperability (spec 148).
 *
 * Shep's A2A endpoint, served over real HTTP, driven by the official A2A
 * TypeScript SDK client (@a2a-js/sdk, protocol 1.0): if the SDK can read the
 * agent card, send, get, list, cancel and stream, any compliant A2A
 * orchestrator can. The use cases behind the handler are in-memory doubles —
 * this test is about the wire format, not the feature workflow.
 */

import 'reflect-metadata';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ClientFactory,
  ClientFactoryOptions,
  JsonRpcTransportFactory,
  type Client,
} from '@a2a-js/sdk/client';
import type {
  AgentActivity,
  AgentActivityChange,
} from '@/application/use-cases/agent-activity/agent-activity.types.js';
import {
  AgentActivityState,
  FeatureConsoleAction,
  FeatureReplyOutcome,
  FeatureState,
  FeatureStateReason,
  SdlcLifecycle,
} from '@/domain/generated/output.js';
import { A2aRequestHandler } from '@/infrastructure/services/a2a/a2a-request-handler.js';
import { A2aHttpEndpoint } from '@/infrastructure/services/a2a/a2a-http-endpoint.js';

const TOKEN = 'test-token';

function activity(featureId: string, overrides: Partial<AgentActivity> = {}): AgentActivity {
  return {
    featureId,
    shortId: featureId,
    name: `Feature ${featureId}`,
    repositoryPath: '/work/acme',
    branch: `feat/${featureId}`,
    state: AgentActivityState.Working,
    reason: FeatureStateReason.AgentRunning,
    featureState: FeatureState.Running,
    lifecycle: SdlcLifecycle.Implementation,
    phase: 'implement',
    pendingQuestions: 0,
    actions: [FeatureConsoleAction.Stop],
    version: 1,
    updatedAt: new Date('2026-10-26T10:00:00Z'),
    ...overrides,
  };
}

/** Node request → fetch Request, so the endpoint sees what Next.js hands a route. */
async function toRequest(
  req: IncomingMessage,
  base: string,
  signal: AbortSignal
): Promise<Request> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers)) {
    if (typeof value === 'string') headers.set(name, value);
  }
  return new Request(new URL(req.url ?? '/', base), {
    method: req.method,
    headers,
    signal,
    ...(chunks.length > 0 ? { body: Buffer.concat(chunks) } : {}),
  });
}

describe('A2A endpoint with the official SDK client', () => {
  let server: Server;
  let baseUrl: string;
  let client: Client;
  let activities: AgentActivity[];
  let changes: AgentActivity[];
  const authorizations: (string | null)[] = [];
  const reply = { execute: vi.fn() };
  const create = { execute: vi.fn() };

  beforeAll(async () => {
    const get = {
      execute: vi.fn(async (input: { featureId?: string } = {}) => {
        const list = input.featureId
          ? activities.filter((a) => a.featureId === input.featureId)
          : activities;
        return { activities: list, notFound: list.length === 0 };
      }),
    };
    const watch = {
      watch: vi.fn(async function* (): AsyncGenerator<AgentActivityChange> {
        for (const a of changes) yield { activity: a, version: a.version };
      }),
    };
    const handler = new A2aRequestHandler(
      get as never,
      watch as never,
      reply as never,
      create as never
    );
    const endpoint = new A2aHttpEndpoint(handler, {
      getVersion: () => ({ name: '@shepai/cli', version: '9.9.9', description: '' }),
    } as never);

    server = createServer(async (req, res) => {
      const controller = new AbortController();
      res.on('close', () => controller.abort());
      authorizations.push(req.headers.authorization ?? null);
      const request = await toRequest(req, baseUrl, controller.signal);
      const response = req.url?.startsWith('/.well-known/agent-card.json')
        ? endpoint.agentCard(request)
        : await endpoint.handle(request);
      res.writeHead(response.status, Object.fromEntries(response.headers));
      const reader = response.body?.getReader();
      for (let chunk = await reader?.read(); chunk && !chunk.done; chunk = await reader?.read()) {
        res.write(chunk.value);
      }
      res.end();
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    const withToken: typeof fetch = (input, init) => {
      const headers = new Headers(init?.headers);
      headers.set('Authorization', `Bearer ${TOKEN}`);
      return fetch(input, { ...init, headers });
    };
    const factory = new ClientFactory(
      ClientFactoryOptions.createFrom(ClientFactoryOptions.default, {
        transports: [new JsonRpcTransportFactory({ fetchImpl: withToken })],
      })
    );
    client = await factory.createFromUrl(baseUrl);
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  beforeEach(() => {
    activities = [activity('f1')];
    changes = [];
    reply.execute.mockReset();
    create.execute.mockReset();
  });

  it('reads the agent card', async () => {
    const card = await client.getAgentCard();
    expect(card.name).toBe('Shep');
    expect(card.version).toBe('9.9.9');
    expect(card.capabilities?.streaming).toBe(true);
    expect(card.supportedInterfaces[0]?.url).toBe(`${baseUrl}/api/a2a`);
    expect(card.skills.map((s) => s.id)).toContain('build-feature');
  });

  it('gets a task, with its state and shep metadata', async () => {
    const task = await client.getTask({ tenant: '', id: 'f1' });
    expect(task.id).toBe('f1');
    expect(task.status?.state).toBe(2); // TASK_STATE_WORKING
    expect(task.metadata?.shep?.phase).toBe('implement');
    expect(authorizations.at(-1)).toBe(`Bearer ${TOKEN}`);
  });

  it('surfaces TaskNotFound as an error', async () => {
    await expect(client.getTask({ tenant: '', id: 'missing' })).rejects.toThrow(/not found/i);
  });

  it('lists tasks', async () => {
    activities = [
      activity('f1'),
      activity('f2', { state: AgentActivityState.Done, reason: FeatureStateReason.RunCompleted }),
    ];
    const list = await client.listTasks({
      tenant: '',
      contextId: '',
      status: 0,
      pageToken: '',
      statusTimestampAfter: undefined,
      pageSize: 10,
    });
    expect(list.tasks.map((t) => t.id)).toEqual(['f1', 'f2']);
    expect(list.totalSize).toBe(2);
  });

  it('sends a message that creates a feature', async () => {
    create.execute.mockResolvedValue({ feature: { id: 'new-1' }, queued: false });
    activities = [
      activity('new-1', {
        state: AgentActivityState.Waiting,
        reason: FeatureStateReason.QueuedForCapacity,
      }),
    ];

    const sent = await client.sendMessage({
      tenant: '',
      message: {
        messageId: 'm-1',
        contextId: '',
        taskId: '',
        role: 1,
        parts: [
          {
            content: { $case: 'text', value: 'Add a login page' },
            metadata: undefined,
            filename: '',
            mediaType: '',
          },
          {
            content: { $case: 'data', value: { repositoryPath: '/work/acme' } },
            metadata: undefined,
            filename: '',
            mediaType: '',
          },
        ],
        metadata: undefined,
        extensions: [],
        referenceTaskIds: [],
      },
      configuration: undefined,
      metadata: undefined,
    });

    expect(create.execute).toHaveBeenCalledWith({
      userInput: 'Add a login page',
      repositoryPath: '/work/acme',
    });
    expect(sent).toMatchObject({ id: 'new-1', status: { state: 1 } }); // TASK_STATE_SUBMITTED
  });

  it('cancels a task', async () => {
    reply.execute.mockResolvedValue({
      outcome: FeatureReplyOutcome.Applied,
      message: 'Stopped',
      activity: activity('f1', {
        state: AgentActivityState.Failed,
        reason: FeatureStateReason.RunCancelled,
      }),
    });

    const task = await client.cancelTask({ tenant: '', id: 'f1', metadata: undefined });

    expect(task.status?.state).toBe(5); // TASK_STATE_CANCELED
  });

  it('streams a task through its status updates until it completes', async () => {
    changes = [
      activity('f1'),
      activity('f1', {
        state: AgentActivityState.Blocked,
        reason: FeatureStateReason.ApprovalGate,
        phase: 'plan',
      }),
      activity('f1', { state: AgentActivityState.Done, reason: FeatureStateReason.RunCompleted }),
    ];

    const kinds: string[] = [];
    const states: number[] = [];
    for await (const event of client.resubscribeTask({ tenant: '', id: 'f1' })) {
      const payload = event.payload;
      if (!payload) continue;
      kinds.push(payload.$case);
      if (payload.$case === 'task') states.push(payload.value.status?.state ?? -1);
      if (payload.$case === 'statusUpdate') states.push(payload.value.status?.state ?? -1);
    }

    expect(kinds).toEqual(['task', 'statusUpdate', 'statusUpdate']);
    expect(states).toEqual([2, 6, 3]); // WORKING, INPUT_REQUIRED, COMPLETED
  });
});
