/**
 * A2A JSON-RPC request handler (spec 148): A2A 1.0 methods over shep's
 * agent-activity use cases. Tasks are features.
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type {
  AgentActivity,
  AgentActivityChange,
} from '@/application/use-cases/agent-activity/agent-activity.types.js';
import {
  AgentActivityState,
  DecisionSurface,
  FeatureConsoleAction,
  FeatureReplyOutcome,
  FeatureState,
  FeatureStateReason,
  SdlcLifecycle,
} from '@/domain/generated/output.js';
import {
  A2aRequestHandler,
  type A2aResponse,
} from '@/infrastructure/services/a2a/a2a-request-handler.js';
import type { JsonRpcResponse } from '@/infrastructure/services/a2a/a2a.types.js';

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
    updatedAt: new Date(0),
    ...overrides,
  };
}

const done = (id: string) =>
  activity(id, { state: AgentActivityState.Done, reason: FeatureStateReason.RunCompleted });

const rpc = (method: string, params: unknown = {}, id: number | string = 1) =>
  JSON.stringify({ jsonrpc: '2.0', id, method, params });

function json(response: A2aResponse): JsonRpcResponse {
  if (response.kind !== 'json') throw new Error('expected a JSON response');
  return response.body;
}

async function events(response: A2aResponse): Promise<JsonRpcResponse[]> {
  if (response.kind !== 'stream') throw new Error('expected a stream');
  const all: JsonRpcResponse[] = [];
  for await (const event of response.events) all.push(event);
  return all;
}

describe('A2aRequestHandler', () => {
  let activities: AgentActivity[];
  let changes: AgentActivity[];
  let get: { execute: ReturnType<typeof vi.fn> };
  let watch: { watch: ReturnType<typeof vi.fn> };
  let reply: { execute: ReturnType<typeof vi.fn> };
  let create: { execute: ReturnType<typeof vi.fn> };
  let handler: A2aRequestHandler;

  beforeEach(() => {
    activities = [activity('f1')];
    changes = [];
    get = {
      execute: vi.fn(async (input: { featureId?: string } = {}) => {
        const list = input.featureId
          ? activities.filter((a) => a.featureId === input.featureId)
          : activities;
        return { activities: list, notFound: input.featureId !== undefined && list.length === 0 };
      }),
    };
    watch = {
      watch: vi.fn(async function* (): AsyncGenerator<AgentActivityChange> {
        for (const a of changes) yield { activity: a, version: a.version };
      }),
    };
    reply = {
      execute: vi.fn(async () => ({
        outcome: FeatureReplyOutcome.Applied,
        message: 'Sent',
        activity: activities[0],
      })),
    };
    create = { execute: vi.fn(async () => ({ feature: { id: 'new-1' }, queued: false })) };
    handler = new A2aRequestHandler(get as never, watch as never, reply as never, create as never);
  });

  const send = (body: string, version: string | null = '1.0', signal?: AbortSignal) =>
    handler.handle(body, { version, ...(signal ? { signal } : {}) });

  describe('JSON-RPC envelope', () => {
    it('answers a parse error with -32700 and a null id', async () => {
      expect(json(await send('{not json'))).toMatchObject({
        jsonrpc: '2.0',
        id: null,
        error: { code: -32700 },
      });
    });

    it('refuses something that is not a request with -32600', async () => {
      expect(json(await send('[]')).error?.code).toBe(-32600);
      expect(
        json(await send(JSON.stringify({ jsonrpc: '1.0', id: 1, method: 'GetTask' }))).error?.code
      ).toBe(-32600);
    });

    it('echoes the request id and answers an unknown method with -32601', async () => {
      expect(json(await send(rpc('Nope', {}, 'req-7')))).toMatchObject({
        id: 'req-7',
        error: { code: -32601 },
      });
    });

    it('refuses another protocol major version with -32009, and serves a missing header as 1.0', async () => {
      expect(json(await send(rpc('GetTask', { id: 'f1' }), '0.3')).error?.code).toBe(-32009);
      expect(json(await send(rpc('GetTask', { id: 'f1' }), '1.1')).result).toBeDefined();
      expect(json(await send(rpc('GetTask', { id: 'f1' }), null)).result).toBeDefined();
    });

    it('answers push notification methods with -32003 and the extended card with -32007', async () => {
      expect(json(await send(rpc('CreateTaskPushNotificationConfig'))).error?.code).toBe(-32003);
      expect(json(await send(rpc('GetExtendedAgentCard'))).error?.code).toBe(-32007);
    });
  });

  describe('GetTask', () => {
    it('returns the feature as a task', async () => {
      const body = json(await send(rpc('GetTask', { id: 'f1' })));
      expect(body.result).toMatchObject({
        id: 'f1',
        contextId: 'f1',
        status: { state: 'TASK_STATE_WORKING' },
      });
    });

    it('answers a missing task with -32001 and a missing id with -32602', async () => {
      expect(json(await send(rpc('GetTask', { id: 'nope' }))).error?.code).toBe(-32001);
      expect(json(await send(rpc('GetTask', {}))).error?.code).toBe(-32602);
    });
  });

  describe('ListTasks', () => {
    beforeEach(() => {
      activities = [
        activity('f1'),
        done('f2'),
        activity('f3', { state: AgentActivityState.Blocked }),
      ];
    });

    it('lists every feature, done ones included', async () => {
      const result = json(await send(rpc('ListTasks'))).result as {
        tasks: { id: string }[];
        totalSize: number;
        nextPageToken: string;
      };
      expect(result.tasks.map((t) => t.id)).toEqual(['f1', 'f2', 'f3']);
      expect(result.totalSize).toBe(3);
      expect(result.nextPageToken).toBe('');
      expect(get.execute).toHaveBeenCalledWith({ includeSettled: true });
    });

    it('filters by status and context, and pages', async () => {
      const byStatus = json(await send(rpc('ListTasks', { status: 'TASK_STATE_COMPLETED' })))
        .result as { tasks: { id: string }[] };
      expect(byStatus.tasks.map((t) => t.id)).toEqual(['f2']);

      const byContext = json(await send(rpc('ListTasks', { contextId: 'f3' }))).result as {
        tasks: { id: string }[];
      };
      expect(byContext.tasks.map((t) => t.id)).toEqual(['f3']);

      const page1 = json(await send(rpc('ListTasks', { pageSize: 2 }))).result as {
        tasks: { id: string }[];
        nextPageToken: string;
        pageSize: number;
      };
      expect(page1.tasks.map((t) => t.id)).toEqual(['f1', 'f2']);
      expect(page1.pageSize).toBe(2);
      const page2 = json(
        await send(rpc('ListTasks', { pageSize: 2, pageToken: page1.nextPageToken }))
      ).result as { tasks: { id: string }[]; nextPageToken: string };
      expect(page2.tasks.map((t) => t.id)).toEqual(['f3']);
      expect(page2.nextPageToken).toBe('');
    });

    it('refuses a page size outside 1..100', async () => {
      expect(json(await send(rpc('ListTasks', { pageSize: 0 }))).error?.code).toBe(-32602);
      expect(json(await send(rpc('ListTasks', { pageSize: 101 }))).error?.code).toBe(-32602);
    });
  });

  describe('SendMessage', () => {
    const message = (parts: unknown[], extra: Record<string, unknown> = {}) => ({
      message: { messageId: 'm1', role: 'ROLE_USER', parts, ...extra },
    });

    it('without a task id, creates a feature in the repository the data part names', async () => {
      activities = [activity('new-1', { state: AgentActivityState.Waiting })];

      const body = json(
        await send(
          rpc(
            'SendMessage',
            message([{ text: 'Add a login page' }, { data: { repositoryPath: '/work/acme' } }])
          )
        )
      );

      expect(create.execute).toHaveBeenCalledWith({
        userInput: 'Add a login page',
        repositoryPath: '/work/acme',
      });
      expect(body.result).toMatchObject({ task: { id: 'new-1' } });
    });

    it('takes the repository from message or request metadata too', async () => {
      activities = [activity('new-1')];
      await send(
        rpc('SendMessage', {
          ...message([{ text: 'Do it' }], { metadata: { repositoryPath: '/a' } }),
        })
      );
      await send(
        rpc('SendMessage', { ...message([{ text: 'Do it' }]), metadata: { repositoryPath: '/b' } })
      );
      expect(create.execute.mock.calls.map((c) => c[0].repositoryPath)).toEqual(['/a', '/b']);
    });

    it('refuses a new task with no text or no repository', async () => {
      expect(
        json(await send(rpc('SendMessage', message([{ data: { repositoryPath: '/a' } }])))).error
          ?.code
      ).toBe(-32602);
      expect(json(await send(rpc('SendMessage', message([{ text: 'x' }])))).error?.code).toBe(
        -32602
      );
      expect(json(await send(rpc('SendMessage', {}))).error?.code).toBe(-32602);
      expect(create.execute).not.toHaveBeenCalled();
    });

    it('with a task id and text, answers the open question', async () => {
      const body = json(
        await send(rpc('SendMessage', message([{ text: 'Postgres' }], { taskId: 'f1' })))
      );

      expect(reply.execute).toHaveBeenCalledWith({
        featureId: 'f1',
        answer: 'Postgres',
        answeredBy: 'a2a',
        surface: DecisionSurface.Other,
      });
      expect(body.result).toMatchObject({ task: { id: 'f1' } });
    });

    it('with a task id and a decision data part, decides the gate', async () => {
      await send(
        rpc(
          'SendMessage',
          message([{ data: { decision: 'reject', feedback: 'Split it' } }], { taskId: 'f1' })
        )
      );

      expect(reply.execute).toHaveBeenCalledWith({
        featureId: 'f1',
        action: FeatureConsoleAction.Reject,
        feedback: 'Split it',
        answeredBy: 'a2a',
        surface: DecisionSurface.Other,
      });
    });

    it('refuses an unknown decision and passes refusals on', async () => {
      expect(
        json(
          await send(
            rpc('SendMessage', message([{ data: { decision: 'maybe' } }], { taskId: 'f1' }))
          )
        ).error?.code
      ).toBe(-32602);

      reply.execute.mockResolvedValueOnce({
        outcome: FeatureReplyOutcome.NotFound,
        message: 'Feature not found: zz',
      });
      expect(
        json(await send(rpc('SendMessage', message([{ text: 'x' }], { taskId: 'zz' })))).error?.code
      ).toBe(-32001);

      reply.execute.mockResolvedValueOnce({
        outcome: FeatureReplyOutcome.Refused,
        message: 'Feature f1 has no open question to answer.',
      });
      const refused = json(
        await send(rpc('SendMessage', message([{ text: 'x' }], { taskId: 'f1' })))
      );
      expect(refused.error).toMatchObject({
        code: -32602,
        message: expect.stringContaining('no open question'),
      });
    });
  });

  describe('CancelTask', () => {
    it('stops the run and returns the task', async () => {
      const body = json(await send(rpc('CancelTask', { id: 'f1' })));

      expect(reply.execute).toHaveBeenCalledWith(
        expect.objectContaining({ featureId: 'f1', action: FeatureConsoleAction.Stop })
      );
      expect(body.result).toMatchObject({ id: 'f1' });
    });

    it('cannot cancel a finished task or one the run refuses to stop', async () => {
      activities = [done('f1')];
      expect(json(await send(rpc('CancelTask', { id: 'f1' }))).error?.code).toBe(-32002);

      activities = [activity('f1')];
      reply.execute.mockResolvedValueOnce({ outcome: FeatureReplyOutcome.Refused, message: 'no' });
      expect(json(await send(rpc('CancelTask', { id: 'f1' }))).error?.code).toBe(-32002);
    });
  });

  describe('SubscribeToTask', () => {
    it('streams the task, then status updates until it is done', async () => {
      changes = [
        activity('f1'),
        activity('f1', { state: AgentActivityState.Blocked }),
        done('f1'),
        activity('f1'),
      ];

      const all = await events(await send(rpc('SubscribeToTask', { id: 'f1' }, 9)));

      expect(all.map((e) => e.id)).toEqual([9, 9, 9]);
      expect(all[0].result).toMatchObject({ task: { id: 'f1' } });
      expect(all[1].result).toMatchObject({
        statusUpdate: { taskId: 'f1', status: { state: 'TASK_STATE_INPUT_REQUIRED' } },
      });
      expect(all[2].result).toMatchObject({
        statusUpdate: { status: { state: 'TASK_STATE_COMPLETED' } },
      });
      expect(watch.watch).toHaveBeenCalledWith(expect.objectContaining({ featureId: 'f1' }));
    });

    it('refuses a missing task and one already finished', async () => {
      expect(json(await send(rpc('SubscribeToTask', { id: 'nope' }))).error?.code).toBe(-32001);
      activities = [done('f1')];
      expect(json(await send(rpc('SubscribeToTask', { id: 'f1' }))).error?.code).toBe(-32004);
    });
  });

  describe('SendStreamingMessage', () => {
    it('replies, then streams the task as SubscribeToTask does', async () => {
      changes = [activity('f1'), done('f1')];

      const all = await events(
        await send(
          rpc('SendStreamingMessage', {
            message: { messageId: 'm', role: 'ROLE_USER', taskId: 'f1', parts: [{ text: 'ok' }] },
          })
        )
      );

      expect(reply.execute).toHaveBeenCalled();
      expect(all[0].result).toMatchObject({ task: { id: 'f1' } });
      expect(all.at(-1)?.result).toMatchObject({
        statusUpdate: { status: { state: 'TASK_STATE_COMPLETED' } },
      });
    });

    it('answers an invalid message with a single JSON error, not a stream', async () => {
      expect(json(await send(rpc('SendStreamingMessage', {}))).error?.code).toBe(-32602);
    });
  });
});
