/**
 * AgentRunnerService Unit Tests
 *
 * Tests for the agent runner that orchestrates agent execution,
 * tracking runs through pending -> running -> completed/failed statuses.
 *
 * TDD Phase: RED-GREEN
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AgentRunnerService } from '@/infrastructure/services/agents/common/agent-runner.service.js';
import type {
  IAgentRegistry,
  AgentDefinitionWithFactory,
} from '@/application/ports/output/agents/agent-registry.interface.js';
import type { IAgentExecutorProvider } from '@/application/ports/output/agents/agent-executor-provider.interface.js';
import type { IAgentRunRepository } from '@/application/ports/output/agents/agent-run-repository.interface.js';
import type {
  IAgentExecutor,
  AgentExecutionStreamEvent,
} from '@/application/ports/output/agents/agent-executor.interface.js';
import { AgentRunStatus, AgentType } from '@/domain/generated/output.js';
import type { AgentRun, AgentRunEvent } from '@/domain/generated/output.js';
import { StreamingExecutorProxy } from '@/infrastructure/services/agents/streaming/streaming-executor-proxy.js';

// Mock the settings singleton — no top-level variable references inside factory
vi.mock('@/infrastructure/services/settings.service.js', () => ({
  getSettings: vi.fn().mockReturnValue({
    agent: {
      type: 'claude-code',
      authMethod: 'session',
    },
  }),
}));

// Mock the checkpointer module (lazy-loaded by agent-runner)
const mockCheckpointer = {};
vi.mock('@/infrastructure/services/agents/common/checkpointer.js', () => ({
  createCheckpointer: vi.fn().mockReturnValue(mockCheckpointer),
}));

// UUID regex for non-deterministic ID assertions
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe('AgentRunnerService', () => {
  let runner: AgentRunnerService;
  let mockRegistry: IAgentRegistry;
  let mockExecutorProvider: IAgentExecutorProvider;
  let mockRunRepository: IAgentRunRepository;
  let mockExecutor: IAgentExecutor;
  let mockCompiledGraph: any;
  let mockDefinition: AgentDefinitionWithFactory;

  beforeEach(() => {
    mockExecutor = {
      agentType: AgentType.ClaudeCode,
      execute: vi.fn(),
      executeStream: vi.fn(),
      supportsFeature: vi.fn(),
    };

    mockCompiledGraph = {
      invoke: vi.fn().mockResolvedValue({
        repositoryPath: '/test/repo',
        analysisMarkdown: '# Analysis Result\nThis is the analysis.',
      }),
    };

    mockDefinition = {
      name: 'analyze-repository',
      description: 'Analyze repository structure',
      graphFactory: vi.fn().mockReturnValue(mockCompiledGraph),
    };

    mockRegistry = {
      register: vi.fn(),
      get: vi.fn().mockResolvedValue(mockDefinition),
      list: vi.fn().mockReturnValue([mockDefinition]),
    };

    mockExecutorProvider = {
      getExecutor: vi.fn().mockReturnValue(mockExecutor),
    };

    const storedRuns = new Map<string, AgentRun>();
    mockRunRepository = {
      create: vi.fn().mockImplementation(async (run: AgentRun) => {
        storedRuns.set(run.id, { ...run });
      }),
      findById: vi.fn().mockImplementation(async (id: string) => {
        return storedRuns.get(id) ?? null;
      }),
      findByThreadId: vi.fn().mockResolvedValue(null),
      findByIds: vi.fn().mockResolvedValue([]),
      updateStatus: vi
        .fn()
        .mockImplementation(
          async (id: string, status: AgentRunStatus, updates?: Partial<AgentRun>) => {
            const existing = storedRuns.get(id);
            if (existing) {
              storedRuns.set(id, { ...existing, status, ...updates });
            }
          }
        ),
      updatePinnedConfig: vi
        .fn()
        .mockImplementation(async (id: string, updates: Partial<AgentRun>) => {
          const existing = storedRuns.get(id);
          if (existing) {
            storedRuns.set(id, { ...existing, ...updates });
          }
        }),
      findRunningByPid: vi.fn().mockResolvedValue([]),
      list: vi.fn().mockResolvedValue([]),
      delete: vi.fn().mockResolvedValue(undefined),
    };

    runner = new AgentRunnerService(mockRegistry, mockExecutorProvider, mockRunRepository);
  });

  describe('runAgent', () => {
    it('should run agent and return completed run record', async () => {
      const result = await runner.runAgent('analyze-repository', 'Analyze the codebase', {
        repositoryPath: '/test/repo',
      });

      expect(result).toBeDefined();
      expect(result.agentName).toBe('analyze-repository');
      expect(result.status).toBe(AgentRunStatus.completed);
      expect(result.result).toBe('# Analysis Result\nThis is the analysis.');
    });

    it('should resolve agent definition from registry', async () => {
      await runner.runAgent('analyze-repository', 'Analyze');

      expect(mockRegistry.get).toHaveBeenCalledWith('analyze-repository');
    });

    it('should get executor from provider', async () => {
      await runner.runAgent('analyze-repository', 'Analyze');

      expect(mockExecutorProvider.getExecutor).toHaveBeenCalledOnce();
    });

    it('should save agent run with pending status first', async () => {
      await runner.runAgent('analyze-repository', 'Analyze');

      const createCall = vi.mocked(mockRunRepository.create).mock.calls[0][0];
      expect(createCall.status).toBe(AgentRunStatus.pending);
      expect(createCall.agentName).toBe('analyze-repository');
      expect(createCall.prompt).toBe('Analyze');
      expect(createCall.id).toMatch(UUID_RE);
      expect(createCall.threadId).toMatch(UUID_RE);
      expect(createCall.id).not.toBe(createCall.threadId);
    });

    it('should update status to running before graph invocation', async () => {
      await runner.runAgent('analyze-repository', 'Analyze');

      const createCall = vi.mocked(mockRunRepository.create).mock.calls[0][0];
      expect(mockRunRepository.updateStatus).toHaveBeenCalledWith(
        createCall.id,
        AgentRunStatus.running,
        expect.objectContaining({
          pid: process.pid,
        })
      );

      // Verify running update happened before graph invoke
      const updateCalls = vi.mocked(mockRunRepository.updateStatus).mock.invocationCallOrder;
      const invokeCalls = vi.mocked(mockCompiledGraph.invoke).mock.invocationCallOrder;
      expect(updateCalls[0]).toBeLessThan(invokeCalls[0]);
    });

    it('should update status to completed after successful execution', async () => {
      await runner.runAgent('analyze-repository', 'Analyze');

      // Second updateStatus call is the completed one
      const updateCalls = vi.mocked(mockRunRepository.updateStatus).mock.calls;
      expect(updateCalls).toHaveLength(2);
      expect(updateCalls[1][1]).toBe(AgentRunStatus.completed);
      expect(updateCalls[1][2]).toEqual(
        expect.objectContaining({
          result: '# Analysis Result\nThis is the analysis.',
        })
      );
    });

    it('should compile graph with executor and checkpointer', async () => {
      await runner.runAgent('analyze-repository', 'Analyze');

      expect(mockDefinition.graphFactory).toHaveBeenCalledWith(mockExecutor, mockCheckpointer);
    });

    it('should invoke graph with repositoryPath and thread config', async () => {
      await runner.runAgent('analyze-repository', 'Analyze', {
        repositoryPath: '/my/project',
      });

      const createCall = vi.mocked(mockRunRepository.create).mock.calls[0][0];
      expect(mockCompiledGraph.invoke).toHaveBeenCalledWith(
        { repositoryPath: '/my/project' },
        { configurable: { thread_id: createCall.threadId } }
      );
    });

    it('should use process.cwd() as default repositoryPath', async () => {
      await runner.runAgent('analyze-repository', 'Analyze');

      expect(mockCompiledGraph.invoke).toHaveBeenCalledWith(
        { repositoryPath: process.cwd() },
        expect.any(Object)
      );
    });

    it('should throw error when agent is not found', async () => {
      vi.mocked(mockRegistry.get).mockResolvedValue(undefined);

      await expect(runner.runAgent('non-existent', 'Analyze')).rejects.toThrow(
        "Agent 'non-existent' not found"
      );
    });

    it('should include available agents in not-found error message', async () => {
      vi.mocked(mockRegistry.get).mockResolvedValue(undefined);

      await expect(runner.runAgent('non-existent', 'Analyze')).rejects.toThrow(
        'analyze-repository'
      );
    });

    it('should handle graph execution errors and set failed status', async () => {
      mockCompiledGraph.invoke.mockRejectedValue(new Error('LLM API timeout'));

      const result = await runner.runAgent('analyze-repository', 'Analyze');

      expect(result.status).toBe(AgentRunStatus.failed);
      expect(result.error).toBe('LLM API timeout');
    });

    it('should handle non-Error thrown values during execution', async () => {
      mockCompiledGraph.invoke.mockRejectedValue('string error');

      const result = await runner.runAgent('analyze-repository', 'Analyze');

      expect(result.status).toBe(AgentRunStatus.failed);
      expect(result.error).toBe('string error');
    });

    it('should set completedAt on failed runs', async () => {
      mockCompiledGraph.invoke.mockRejectedValue(new Error('failure'));

      await runner.runAgent('analyze-repository', 'Analyze');

      const updateCalls = vi.mocked(mockRunRepository.updateStatus).mock.calls;
      const failedUpdate = updateCalls[1];
      expect(failedUpdate[1]).toBe(AgentRunStatus.failed);
      expect(failedUpdate[2]).toEqual(
        expect.objectContaining({
          completedAt: expect.any(String),
          error: 'failure',
        })
      );
    });

    it('should use result field when analysisMarkdown is not present', async () => {
      mockCompiledGraph.invoke.mockResolvedValue({
        repositoryPath: '/test',
        result: 'Plain result text',
      });

      const result = await runner.runAgent('analyze-repository', 'Analyze');

      expect(result.result).toBe('Plain result text');
    });

    it('should JSON stringify result when neither analysisMarkdown nor result is present', async () => {
      const graphOutput = { repositoryPath: '/test', customField: 'value' };
      mockCompiledGraph.invoke.mockResolvedValue(graphOutput);

      const result = await runner.runAgent('analyze-repository', 'Analyze');

      expect(result.result).toBe(JSON.stringify(graphOutput));
    });
  });

  describe('runAgentStream', () => {
    function makeStreamEvent(
      type: 'progress' | 'result' | 'error',
      content: string
    ): AgentExecutionStreamEvent {
      return { type, content, timestamp: new Date() };
    }

    /**
     * Set up the mock executor to stream events via executeStream.
     * The graph invocation happens via the proxy, which calls executeStream internally.
     * The graph's .invoke() triggers the proxy's execute() which iterates the stream.
     */
    function setupStreamingMocks(events: AgentExecutionStreamEvent[]) {
      // The executor's executeStream yields the provided events
      mockExecutor.executeStream = async function* () {
        for (const event of events) {
          yield event;
        }
      };

      // The graph factory receives the proxy and invokes it.
      // We intercept graphFactory to call proxy.execute() which triggers streaming.
      mockDefinition.graphFactory = vi.fn().mockImplementation((executor: IAgentExecutor) => {
        return {
          invoke: vi.fn().mockImplementation(async (state: Record<string, unknown>) => {
            const result = await executor.execute('test prompt', {
              cwd: state.repositoryPath as string,
            });
            return { repositoryPath: state.repositoryPath, analysisMarkdown: result.result };
          }),
        };
      });
    }

    it('should yield progress events from executor stream', async () => {
      setupStreamingMocks([
        makeStreamEvent('progress', 'Analyzing...'),
        makeStreamEvent('progress', 'Almost done...'),
        makeStreamEvent('result', 'Final result'),
      ]);

      const events: AgentRunEvent[] = [];
      for await (const event of runner.runAgentStream('analyze-repository', 'Analyze', {
        repositoryPath: '/test/repo',
      })) {
        events.push(event);
      }

      expect(events).toHaveLength(3);
      expect(events[0].type).toBe('progress');
      expect(events[0].content).toBe('Analyzing...');
      expect(events[1].content).toBe('Almost done...');
    });

    it('should yield mapped AgentRunEvent with string timestamps', async () => {
      setupStreamingMocks([makeStreamEvent('result', 'done')]);

      const events: AgentRunEvent[] = [];
      for await (const event of runner.runAgentStream('analyze-repository', 'Analyze')) {
        events.push(event);
      }

      expect(events).toHaveLength(1);
      expect(typeof events[0].timestamp).toBe('string');
    });

    it('should create pending and running status before streaming', async () => {
      setupStreamingMocks([makeStreamEvent('result', 'done')]);

      const events: AgentRunEvent[] = [];
      for await (const event of runner.runAgentStream('analyze-repository', 'Analyze')) {
        events.push(event);
      }

      // Verify create was called with pending status
      expect(mockRunRepository.create).toHaveBeenCalledOnce();
      const createCall = vi.mocked(mockRunRepository.create).mock.calls[0][0];
      expect(createCall.status).toBe(AgentRunStatus.pending);

      // Verify first updateStatus was running
      const updateCalls = vi.mocked(mockRunRepository.updateStatus).mock.calls;
      expect(updateCalls[0][1]).toBe(AgentRunStatus.running);
    });

    it('should update run to completed after stream ends', async () => {
      setupStreamingMocks([makeStreamEvent('result', 'Final analysis')]);

      for await (const _event of runner.runAgentStream('analyze-repository', 'Analyze')) {
        /* drain */
      }

      const updateCalls = vi.mocked(mockRunRepository.updateStatus).mock.calls;
      // Last updateStatus should be completed
      const lastUpdate = updateCalls[updateCalls.length - 1];
      expect(lastUpdate[1]).toBe(AgentRunStatus.completed);
    });

    it('should update run to failed when graph errors', async () => {
      // Executor stream works, but graph invoke itself fails
      mockDefinition.graphFactory = vi.fn().mockImplementation(() => ({
        invoke: vi.fn().mockRejectedValue(new Error('Graph crashed')),
      }));

      for await (const _event of runner.runAgentStream('analyze-repository', 'Analyze')) {
        /* drain */
      }

      const updateCalls = vi.mocked(mockRunRepository.updateStatus).mock.calls;
      const lastUpdate = updateCalls[updateCalls.length - 1];
      expect(lastUpdate[1]).toBe(AgentRunStatus.failed);
      expect(lastUpdate[2]).toEqual(expect.objectContaining({ error: 'Graph crashed' }));
    });

    it('should throw for unknown agent name', async () => {
      vi.mocked(mockRegistry.get).mockResolvedValue(undefined);

      const streamFn = async () => {
        for await (const _event of runner.runAgentStream('non-existent', 'Analyze')) {
          /* drain */
        }
      };

      await expect(streamFn()).rejects.toThrow("Agent 'non-existent' not found");
    });

    it('should compile graph with StreamingExecutorProxy', async () => {
      setupStreamingMocks([makeStreamEvent('result', 'done')]);

      for await (const _event of runner.runAgentStream('analyze-repository', 'Analyze')) {
        /* drain */
      }

      const factoryCall = vi.mocked(mockDefinition.graphFactory).mock.calls[0];
      expect(factoryCall[0]).toBeInstanceOf(StreamingExecutorProxy);
    });
  });
});
