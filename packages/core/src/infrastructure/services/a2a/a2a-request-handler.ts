/**
 * A2A request handler (spec 148).
 *
 * Serves A2A 1.0 over JSON-RPC: other agent systems hand shep a feature
 * request and follow it as a task. Tasks are features (id = context id =
 * feature id). Every method is a thin translation over the agent-activity use
 * cases and CreateFeatureUseCase; no business rule lives here.
 *
 * Framework-free: the web route passes the raw body and the A2A-Version
 * header, and writes back JSON or SSE frames.
 */

import { inject, injectable } from 'tsyringe';
import {
  DecisionSurface,
  FeatureConsoleAction,
  FeatureReplyOutcome,
} from '../../../domain/generated/output.js';
import { isTerminalActivity } from '../../../domain/shared/agent-activity.js';
import { GetAgentActivityUseCase } from '../../../application/use-cases/agent-activity/get-agent-activity.use-case.js';
import { WatchAgentActivityUseCase } from '../../../application/use-cases/agent-activity/watch-agent-activity.use-case.js';
import {
  ReplyToFeatureUseCase,
  type ReplyToFeatureInput,
} from '../../../application/use-cases/agent-activity/reply-to-feature.use-case.js';
import type { AgentActivity } from '../../../application/use-cases/agent-activity/agent-activity.types.js';
import { CreateFeatureUseCase } from '../../../application/use-cases/features/create/create-feature.use-case.js';
import {
  A2aError,
  RequestError,
  checkVersion,
  failure,
  parseRequest,
  requireString,
  result,
} from './a2a-json-rpc.js';
import { readMessage, replyOf, repositoryPathOf } from './a2a-message.js';
import { statusUpdateOf, taskOf } from './a2a-task-mapper.js';
import {
  A2aErrorCode,
  A2aMethod,
  type A2aStreamResponse,
  type A2aTask,
  type JsonRpcId,
  type JsonRpcResponse,
} from './a2a.types.js';

/** How replies sent over A2A are attributed. */
const A2A_ANSWERED_BY = 'a2a';
const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;

const PUSH_METHODS: ReadonlySet<string> = new Set([
  A2aMethod.CreateTaskPushNotificationConfig,
  A2aMethod.GetTaskPushNotificationConfig,
  A2aMethod.ListTaskPushNotificationConfigs,
  A2aMethod.DeleteTaskPushNotificationConfig,
]);

const REPLY_ERROR: Record<FeatureReplyOutcome, A2aErrorCode | undefined> = {
  [FeatureReplyOutcome.Applied]: undefined,
  [FeatureReplyOutcome.NotFound]: A2aErrorCode.TaskNotFound,
  [FeatureReplyOutcome.Ambiguous]: A2aErrorCode.InvalidParams,
  [FeatureReplyOutcome.Refused]: A2aErrorCode.InvalidParams,
};

export interface A2aRequestContext {
  /** The A2A-Version header (or query parameter), if the client sent one. */
  version: string | null;
  /** Ends a stream when the client goes away. */
  signal?: AbortSignal;
}

export type A2aResponse =
  | { kind: 'json'; body: JsonRpcResponse }
  | { kind: 'stream'; events: AsyncIterable<JsonRpcResponse> };

@injectable()
export class A2aRequestHandler {
  constructor(
    @inject(GetAgentActivityUseCase)
    private readonly getActivity: GetAgentActivityUseCase,
    @inject(WatchAgentActivityUseCase)
    private readonly watchActivity: WatchAgentActivityUseCase,
    @inject(ReplyToFeatureUseCase)
    private readonly replyToFeature: ReplyToFeatureUseCase,
    @inject(CreateFeatureUseCase)
    private readonly createFeature: CreateFeatureUseCase
  ) {}

  async handle(raw: string, context: A2aRequestContext): Promise<A2aResponse> {
    let id: JsonRpcId = null;
    try {
      const request = parseRequest(raw);
      id = request.id;
      checkVersion(context.version);
      return await this.dispatch(request.method, request.params, id, context);
    } catch (error) {
      if (error instanceof RequestError) return json(failure(error.id, error.error));
      if (error instanceof A2aError) return json(failure(id, error));
      const message = error instanceof Error ? error.message : String(error);
      return json(failure(id, new A2aError(A2aErrorCode.InternalError, message)));
    }
  }

  private async dispatch(
    method: string,
    params: Record<string, unknown>,
    id: JsonRpcId,
    context: A2aRequestContext
  ): Promise<A2aResponse> {
    switch (method) {
      case A2aMethod.GetTask:
        return json(result(id, await this.getTask(requireString(params, 'id'))));
      case A2aMethod.ListTasks:
        return json(result(id, await this.listTasks(params)));
      case A2aMethod.SendMessage:
        return json(result(id, { task: await this.sendMessage(params) }));
      case A2aMethod.SendStreamingMessage: {
        const task = await this.sendMessage(params);
        return stream(id, this.follow(task.id, context.signal));
      }
      case A2aMethod.CancelTask:
        return json(result(id, await this.cancelTask(requireString(params, 'id'))));
      case A2aMethod.SubscribeToTask: {
        const activity = await this.activityOf(requireString(params, 'id'));
        if (isTerminalActivity(activity.state)) {
          throw new A2aError(A2aErrorCode.UnsupportedOperation, 'The task has already finished.');
        }
        return stream(id, this.follow(activity.featureId, context.signal));
      }
      case A2aMethod.GetExtendedAgentCard:
        throw new A2aError(A2aErrorCode.ExtendedAgentCardNotConfigured, 'No extended agent card.');
      default:
        if (PUSH_METHODS.has(method)) {
          throw new A2aError(
            A2aErrorCode.PushNotificationNotSupported,
            'Push notifications are not supported; use SubscribeToTask.'
          );
        }
        throw new A2aError(A2aErrorCode.MethodNotFound, `Unknown method: ${method}`);
    }
  }

  private async getTask(taskId: string): Promise<A2aTask> {
    return taskOf(await this.activityOf(taskId));
  }

  private async listTasks(params: Record<string, unknown>) {
    const pageSize = params.pageSize ?? DEFAULT_PAGE_SIZE;
    if (
      typeof pageSize !== 'number' ||
      !Number.isInteger(pageSize) ||
      pageSize < 1 ||
      pageSize > MAX_PAGE_SIZE
    ) {
      throw new A2aError(
        A2aErrorCode.InvalidParams,
        `pageSize must be between 1 and ${MAX_PAGE_SIZE}.`
      );
    }
    const offset =
      typeof params.pageToken === 'string' && params.pageToken ? Number(params.pageToken) : 0;
    if (!Number.isInteger(offset) || offset < 0) {
      throw new A2aError(A2aErrorCode.InvalidParams, 'pageToken is not one this server issued.');
    }
    const { activities } = await this.getActivity.execute({ includeSettled: true });
    const tasks = activities
      .map(taskOf)
      .filter((t) => !params.contextId || t.contextId === params.contextId)
      .filter((t) => !params.status || t.status.state === params.status);
    const page = tasks.slice(offset, offset + pageSize);
    const next = offset + page.length;
    return {
      tasks: page,
      nextPageToken: next < tasks.length ? String(next) : '',
      pageSize,
      totalSize: tasks.length,
    };
  }

  /** A new task creates a feature; a message on a task answers or decides it. */
  private async sendMessage(params: Record<string, unknown>): Promise<A2aTask> {
    const message = readMessage(params);
    if (message.taskId) {
      const reply = replyOf(message);
      return this.reply(
        reply.kind === 'decision'
          ? {
              featureId: message.taskId,
              action: reply.action,
              ...(reply.feedback ? { feedback: reply.feedback } : {}),
            }
          : { featureId: message.taskId, answer: reply.answer }
      );
    }
    const repositoryPath = repositoryPathOf(message);
    if (!message.text || !repositoryPath) {
      throw new A2aError(
        A2aErrorCode.InvalidParams,
        'A new task needs the request as text and a data part {"repositoryPath": "/abs/path"}.'
      );
    }
    const { feature } = await this.createFeature.execute({
      userInput: message.text,
      repositoryPath,
      useWorkflowDefaults: true,
    });
    return this.getTask(feature.id);
  }

  private async cancelTask(taskId: string): Promise<A2aTask> {
    const activity = await this.activityOf(taskId);
    if (isTerminalActivity(activity.state)) {
      throw new A2aError(A2aErrorCode.TaskNotCancelable, 'The task has already finished.');
    }
    try {
      return await this.reply({ featureId: activity.featureId, action: FeatureConsoleAction.Stop });
    } catch (error) {
      if (!(error instanceof A2aError)) throw error;
      throw new A2aError(A2aErrorCode.TaskNotCancelable, error.message);
    }
  }

  private async reply(
    input: Omit<ReplyToFeatureInput, 'answeredBy' | 'surface'>
  ): Promise<A2aTask> {
    const outcome = await this.replyToFeature.execute({
      ...input,
      answeredBy: A2A_ANSWERED_BY,
      surface: DecisionSurface.Other,
    });
    const code = REPLY_ERROR[outcome.outcome];
    if (code !== undefined) throw new A2aError(code, outcome.message, { outcome: outcome.outcome });
    return outcome.activity ? taskOf(outcome.activity) : this.getTask(input.featureId);
  }

  private async activityOf(taskId: string): Promise<AgentActivity> {
    const { activities } = await this.getActivity.execute({ featureId: taskId });
    const activity = activities.find((a) => a.featureId === taskId);
    if (!activity) throw new A2aError(A2aErrorCode.TaskNotFound, `Task not found: ${taskId}`);
    return activity;
  }

  /** The task first, then a status update per change, ending after a terminal one. */
  private async *follow(taskId: string, signal?: AbortSignal): AsyncGenerator<A2aStreamResponse> {
    let first = true;
    for await (const { activity } of this.watchActivity.watch({
      featureId: taskId,
      ...(signal ? { signal } : {}),
    })) {
      if (activity.featureId !== taskId) continue;
      yield first ? { task: taskOf(activity) } : { statusUpdate: statusUpdateOf(activity) };
      first = false;
      if (isTerminalActivity(activity.state)) return;
    }
  }
}

function json(body: JsonRpcResponse): A2aResponse {
  return { kind: 'json', body };
}

function stream(id: JsonRpcId, events: AsyncIterable<A2aStreamResponse>): A2aResponse {
  return {
    kind: 'stream',
    events: (async function* () {
      for await (const event of events) yield result(id, event);
    })(),
  };
}
