/**
 * Agent Runner Service
 *
 * Infrastructure implementation of the IAgentRunner port.
 * Orchestrates agent execution by resolving definitions from the registry,
 * creating executors, compiling LangGraph workflows, and tracking runs
 * in the repository.
 */

import * as crypto from 'node:crypto';
import type { BaseCheckpointSaver } from '@langchain/langgraph';
import type {
  IAgentRunner,
  AgentRunOptions,
} from '@/application/ports/output/agents/agent-runner.interface.js';
import type { IAgentRegistry } from '@/application/ports/output/agents/agent-registry.interface.js';
import type { IAgentExecutorProvider } from '@/application/ports/output/agents/agent-executor-provider.interface.js';
import type { IAgentRunRepository } from '@/application/ports/output/agents/agent-run-repository.interface.js';
import type { AgentExecutionStreamEvent } from '@/application/ports/output/agents/agent-executor.interface.js';
import type { AgentRun, AgentRunEvent } from '@/domain/generated/output.js';
import { AgentRunStatus } from '@/domain/generated/output.js';
import { getSettings } from '@/infrastructure/services/settings.service.js';
import { EventChannel } from '../streaming/event-channel.js';
import { StreamingExecutorProxy } from '../streaming/streaming-executor-proxy.js';

/**
 * Lazy-loads the checkpointer to avoid ~240ms startup cost from
 * @langchain/langgraph-checkpoint-sqlite on every CLI invocation.
 * The import only happens when an agent is actually run.
 */
let _checkpointer: BaseCheckpointSaver | null = null;
async function getCheckpointer(): Promise<BaseCheckpointSaver> {
  if (!_checkpointer) {
    const { createCheckpointer } = await import('./checkpointer.js');
    _checkpointer = createCheckpointer(':memory:');
  }
  return _checkpointer;
}

export class AgentRunnerService implements IAgentRunner {
  constructor(
    private readonly registry: IAgentRegistry,
    private readonly executorProvider: IAgentExecutorProvider,
    private readonly runRepository: IAgentRunRepository
  ) {}

  async runAgent(agentName: string, prompt: string, options?: AgentRunOptions): Promise<AgentRun> {
    const { definition, executor, runId, threadId } = await this.setupRun(agentName, prompt);

    try {
      const checkpointer = await getCheckpointer();
      const compiledGraph = definition.graphFactory(executor, checkpointer);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await (compiledGraph as any).invoke(
        { repositoryPath: options?.repositoryPath ?? process.cwd() },
        { configurable: { thread_id: threadId } }
      );

      await this.markCompleted(runId, result);
      return (await this.runRepository.findById(runId))!;
    } catch (error) {
      await this.markFailed(runId, error);
      return (await this.runRepository.findById(runId))!;
    }
  }

  async *runAgentStream(
    agentName: string,
    prompt: string,
    options?: AgentRunOptions
  ): AsyncIterable<AgentRunEvent> {
    const { definition, executor, runId, threadId } = await this.setupRun(agentName, prompt);

    // Create streaming channel and proxy
    const channel = new EventChannel<AgentExecutionStreamEvent>();
    const proxy = new StreamingExecutorProxy(executor, channel);

    // Compile graph with proxy (graph doesn't know about streaming)
    const checkpointer = await getCheckpointer();
    const compiledGraph = definition.graphFactory(proxy, checkpointer);

    // Start graph invocation in background. The channel spans every node of
    // the graph (the proxy never closes it), so it is closed exactly once here,
    // after the run's outcome is recorded — on success and failure alike.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const graphPromise = (compiledGraph as any)
      .invoke(
        { repositoryPath: options?.repositoryPath ?? process.cwd() },
        { configurable: { thread_id: threadId } }
      )
      .then((result: Record<string, unknown>) => this.markCompleted(runId, result))
      .catch((error: unknown) => this.markFailed(runId, error))
      .finally(() => channel.close());

    // Yield events as they arrive, mapping infra → domain type
    for await (const event of channel) {
      yield {
        type: event.type,
        content: event.content,
        timestamp:
          event.timestamp instanceof Date ? event.timestamp.toISOString() : event.timestamp,
      } as AgentRunEvent;
    }

    // Ensure graph promise cleanup completes
    await graphPromise;
  }

  private async setupRun(agentName: string, prompt: string) {
    const definition = await this.registry.get(agentName);
    if (!definition) {
      throw new Error(
        `Agent '${agentName}' not found. Available: ${this.registry
          .list()
          .map((a) => a.name)
          .join(', ')}`
      );
    }

    const settings = getSettings();
    const agentType = settings.agent.type;
    const executor = await this.executorProvider.getExecutor();

    const runId = crypto.randomUUID();
    const threadId = crypto.randomUUID();
    const now = new Date().toISOString();

    const agentRun: AgentRun = {
      id: runId,
      agentType,
      agentName,
      status: AgentRunStatus.pending,
      prompt,
      threadId,
      createdAt: now,
      updatedAt: now,
    };
    await this.runRepository.create(agentRun);

    await this.runRepository.updateStatus(runId, AgentRunStatus.running, {
      pid: process.pid,
      startedAt: now,
      updatedAt: now,
    });

    return { definition, executor, runId, threadId };
  }

  private async markCompleted(runId: string, result: Record<string, unknown>) {
    const completedAt = new Date().toISOString();
    await this.runRepository.updateStatus(runId, AgentRunStatus.completed, {
      result:
        (result.analysisMarkdown as string) ?? (result.result as string) ?? JSON.stringify(result),
      completedAt,
      updatedAt: completedAt,
    });
  }

  private async markFailed(runId: string, error: unknown) {
    const failedAt = new Date().toISOString();
    await this.runRepository.updateStatus(runId, AgentRunStatus.failed, {
      error: error instanceof Error ? error.message : String(error),
      completedAt: failedAt,
      updatedAt: failedAt,
    });
  }
}
