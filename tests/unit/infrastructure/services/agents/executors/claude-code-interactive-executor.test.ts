/**
 * ClaudeCodeInteractiveExecutor Unit Tests
 *
 * Verifies that the V2 SDK session options are built correctly,
 * especially that allowedTools is passed to auto-allow standard tools
 * and canUseTool intercepts AskUserQuestion.
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the SDK before importing the executor
const mockCreateSession = vi.fn();
const mockResumeSession = vi.fn();

vi.mock('@anthropic-ai/claude-agent-sdk', () => ({
  unstable_v2_createSession: (...args: unknown[]) => mockCreateSession(...args),
  unstable_v2_resumeSession: (...args: unknown[]) => mockResumeSession(...args),
}));

import { ClaudeCodeInteractiveExecutor } from '@/infrastructure/services/agents/common/executors/claude-code-interactive-executor.service.js';
import { DEFAULT_MODEL_ID } from '@/domain/shared/default-model.js';

function createMockSdkSession() {
  return {
    sessionId: 'test-session-id',
    send: vi.fn(),
    stream: vi.fn().mockReturnValue({
      [Symbol.asyncIterator]: () => ({
        next: vi.fn().mockResolvedValue({ done: true }),
      }),
    }),
    close: vi.fn(),
  };
}

describe('ClaudeCodeInteractiveExecutor', () => {
  let executor: ClaudeCodeInteractiveExecutor;
  let capturedOptions: Record<string, unknown>;

  beforeEach(() => {
    vi.clearAllMocks();
    capturedOptions = {};

    const mockSession = createMockSdkSession();
    mockCreateSession.mockImplementation((opts: Record<string, unknown>) => {
      capturedOptions = opts;
      return mockSession;
    });
    mockResumeSession.mockImplementation((_id: string, opts: Record<string, unknown>) => {
      capturedOptions = opts;
      return mockSession;
    });

    executor = new ClaudeCodeInteractiveExecutor();
  });

  describe('buildSdkOptions (via createSession)', () => {
    it('should pass allowedTools with all standard tool names', async () => {
      await executor.createSession({
        cwd: process.cwd(),
        model: 'claude-sonnet-4-6',
      });

      expect(capturedOptions.allowedTools).toBeDefined();
      const tools = capturedOptions.allowedTools as string[];
      expect(tools).toContain('Bash');
      expect(tools).toContain('Read');
      expect(tools).toContain('Write');
      expect(tools).toContain('Edit');
      expect(tools).toContain('Glob');
      expect(tools).toContain('Grep');
      expect(tools).toContain('Agent');
      expect(tools).toContain('WebFetch');
      expect(tools).toContain('WebSearch');
    });

    it('should NOT include AskUserQuestion in allowedTools', async () => {
      await executor.createSession({
        cwd: process.cwd(),
        model: 'claude-sonnet-4-6',
      });

      const tools = capturedOptions.allowedTools as string[];
      expect(tools).not.toContain('AskUserQuestion');
    });

    it('should NOT pass permissionMode bypassPermissions', async () => {
      await executor.createSession({
        cwd: process.cwd(),
        model: 'claude-sonnet-4-6',
      });

      expect(capturedOptions.permissionMode).toBeUndefined();
    });

    it('should pass canUseTool callback when onUserQuestion is provided', async () => {
      const onUserQuestion = vi.fn().mockResolvedValue({ q1: 'answer' });
      await executor.createSession({
        cwd: process.cwd(),
        model: 'claude-sonnet-4-6',
        onUserQuestion,
      });

      expect(capturedOptions.canUseTool).toBeDefined();
      expect(typeof capturedOptions.canUseTool).toBe('function');
    });

    it('should ALWAYS pass canUseTool — even without onUserQuestion (issue #582)', async () => {
      // canUseTool is the fallback approver for any tool not in
      // AUTO_ALLOWED_TOOLS — most importantly MCP tools the user has
      // configured. Without this, MCP calls from chat are blocked.
      await executor.createSession({
        cwd: process.cwd(),
        model: 'claude-sonnet-4-6',
      });

      expect(capturedOptions.canUseTool).toBeDefined();
      expect(typeof capturedOptions.canUseTool).toBe('function');
    });

    it('canUseTool should auto-allow MCP tools so chat can call them (issue #582)', async () => {
      await executor.createSession({
        cwd: process.cwd(),
        model: 'claude-sonnet-4-6',
      });

      const canUseTool = capturedOptions.canUseTool as (
        name: string,
        input: Record<string, unknown>,
        opts: { toolUseID: string }
      ) => Promise<{ behavior: string }>;

      const mcpResult = await canUseTool(
        'mcp__atlassian__search_issues',
        { jql: 'assignee = currentUser()' },
        { toolUseID: 'tu_mcp' }
      );
      expect(mcpResult.behavior).toBe('allow');
    });

    it('canUseTool should auto-allow non-AskUserQuestion tools', async () => {
      const onUserQuestion = vi.fn();
      await executor.createSession({
        cwd: process.cwd(),
        model: 'claude-sonnet-4-6',
        onUserQuestion,
      });

      const canUseTool = capturedOptions.canUseTool as (
        name: string,
        input: Record<string, unknown>,
        opts: { toolUseID: string }
      ) => Promise<{ behavior: string }>;

      const result = await canUseTool('Bash', { command: 'ls' }, { toolUseID: 'tu_1' });
      expect(result.behavior).toBe('allow');
      expect(onUserQuestion).not.toHaveBeenCalled();
    });

    it('canUseTool should delegate AskUserQuestion to onUserQuestion callback', async () => {
      const onUserQuestion = vi.fn().mockResolvedValue({ q1: 'my answer' });
      await executor.createSession({
        cwd: process.cwd(),
        model: 'claude-sonnet-4-6',
        onUserQuestion,
      });

      const canUseTool = capturedOptions.canUseTool as (
        name: string,
        input: Record<string, unknown>,
        opts: { toolUseID: string }
      ) => Promise<{ behavior: string; updatedInput?: Record<string, unknown> }>;

      const questions = [{ id: 'q1', text: 'What is your name?' }];
      const result = await canUseTool('AskUserQuestion', { questions }, { toolUseID: 'tu_ask' });

      expect(result.behavior).toBe('allow');
      expect(result.updatedInput).toEqual({
        questions,
        answers: { q1: 'my answer' },
      });
      expect(onUserQuestion).toHaveBeenCalledWith({
        toolCallId: 'tu_ask',
        questions,
      });
    });

    it('should strip CLAUDECODE env var', async () => {
      const originalClaudeCode = process.env.CLAUDECODE;
      process.env.CLAUDECODE = 'some-value';

      try {
        await executor.createSession({
          cwd: process.cwd(),
          model: 'claude-sonnet-4-6',
        });

        const env = capturedOptions.env as Record<string, string | undefined>;
        expect(env.CLAUDECODE).toBeUndefined();
      } finally {
        if (originalClaudeCode !== undefined) {
          process.env.CLAUDECODE = originalClaudeCode;
        } else {
          delete process.env.CLAUDECODE;
        }
      }
    });

    it('should NOT forward systemPrompt to the V2 SDK (silently dropped)', async () => {
      // The V2 Agent SDK's SDKSessionOptions type does not include a
      // systemPrompt field — passing one is silently dropped. Callers that
      // need to inject a system-level brief must do so via a real artifact
      // the agent reads with its tools (see CreateApplicationUseCase and
      // SHEP_BRIEF.md). This test guards against re-introducing the
      // "it looks wired but nothing happens" trap.
      await executor.createSession({
        cwd: process.cwd(),
        model: 'claude-sonnet-4-6',
        systemPrompt: 'You are a helpful assistant.',
      });

      expect(capturedOptions.systemPrompt).toBeUndefined();
    });

    it('should use default model when not specified', async () => {
      await executor.createSession({
        cwd: process.cwd(),
      } as Parameters<typeof executor.createSession>[0]);

      expect(capturedOptions.model).toBe(DEFAULT_MODEL_ID);
    });
  });

  describe('agentQuestionBridge routing (spec 093, task 19)', () => {
    it('should route AskUserQuestion through agentQuestionBridge when present', async () => {
      const bridge = {
        ask: vi.fn().mockResolvedValue({ 'What is your name?': 'Ariel' }),
      };
      await executor.createSession({
        cwd: process.cwd(),
        model: 'claude-sonnet-4-6',
        agentQuestionBridge: bridge,
      });

      const canUseTool = capturedOptions.canUseTool as (
        name: string,
        input: Record<string, unknown>,
        opts: { toolUseID: string }
      ) => Promise<{ behavior: string; updatedInput?: Record<string, unknown> }>;

      const questions = [
        { question: 'What is your name?', header: 'Name', options: [], multiSelect: false },
      ];
      const result = await canUseTool('AskUserQuestion', { questions }, { toolUseID: 'tu_bridge' });

      expect(result.behavior).toBe('allow');
      expect(result.updatedInput).toEqual({
        questions,
        answers: { 'What is your name?': 'Ariel' },
      });
      expect(bridge.ask).toHaveBeenCalledWith({
        toolCallId: 'tu_bridge',
        questions,
      });
    });

    it('falls through to onUserQuestion when bridge returns null (flag-off path)', async () => {
      const bridge = { ask: vi.fn().mockResolvedValue(null) };
      const onUserQuestion = vi.fn().mockResolvedValue({ q1: 'legacy-answer' });

      await executor.createSession({
        cwd: process.cwd(),
        model: 'claude-sonnet-4-6',
        agentQuestionBridge: bridge,
        onUserQuestion,
      });

      const canUseTool = capturedOptions.canUseTool as (
        name: string,
        input: Record<string, unknown>,
        opts: { toolUseID: string }
      ) => Promise<{ behavior: string; updatedInput?: Record<string, unknown> }>;

      const questions = [{ question: 'q1', header: 'Q1', options: [], multiSelect: false }];
      const result = await canUseTool('AskUserQuestion', { questions }, { toolUseID: 'tu_legacy' });

      expect(bridge.ask).toHaveBeenCalledTimes(1);
      expect(onUserQuestion).toHaveBeenCalledTimes(1);
      expect(result.updatedInput).toEqual({
        questions,
        answers: { q1: 'legacy-answer' },
      });
    });

    it('canUseTool callback resolves only when bridge.ask resolves (Deferred round-trip)', async () => {
      let resolveAsk: ((answers: Record<string, string>) => void) | undefined;
      const askPromise = new Promise<Record<string, string>>((r) => {
        resolveAsk = r;
      });
      const bridge = { ask: vi.fn().mockReturnValue(askPromise) };

      await executor.createSession({
        cwd: process.cwd(),
        model: 'claude-sonnet-4-6',
        agentQuestionBridge: bridge,
      });

      const canUseTool = capturedOptions.canUseTool as (
        name: string,
        input: Record<string, unknown>,
        opts: { toolUseID: string }
      ) => Promise<{ behavior: string; updatedInput?: Record<string, unknown> }>;

      const questions = [{ question: 'go?', header: 'Go', options: [], multiSelect: false }];
      const callbackPromise = canUseTool(
        'AskUserQuestion',
        { questions },
        { toolUseID: 'tu_round' }
      );

      // Verify the callback is still pending while the bridge awaits.
      let resolved = false;
      void callbackPromise.then(() => {
        resolved = true;
      });
      await Promise.resolve();
      expect(resolved).toBe(false);

      resolveAsk!({ 'go?': 'yes' });
      const result = await callbackPromise;

      expect(result.updatedInput).toEqual({
        questions,
        answers: { 'go?': 'yes' },
      });
    });
  });

  describe('usage on result events', () => {
    // The SDK's `input_tokens` EXCLUDES prompt-cache reads and writes. The
    // batch Claude executor reports input as input + cache creation + cache
    // read, so an interactive session under-reported its input by the whole
    // cached prompt — typically most of it — next to a feature run that did
    // not.
    const USAGE = {
      input_tokens: 12,
      output_tokens: 40,
      cache_creation_input_tokens: 300,
      cache_read_input_tokens: 5_000,
    };

    async function streamResult(result: Record<string, unknown>) {
      const messages = [{ type: 'result', session_id: 's-1', usage: USAGE, ...result }];
      const sdkSession = {
        ...createMockSdkSession(),
        stream: () =>
          (async function* () {
            yield* messages;
          })(),
      };
      mockCreateSession.mockReturnValue(sdkSession);
      const handle = await executor.createSession({ cwd: process.cwd() });
      const events = [];
      for await (const event of handle.stream()) events.push(event);
      return events;
    }

    it('counts cached prompt tokens as input on a successful turn', async () => {
      const [event] = await streamResult({ subtype: 'success', result: 'hi', num_turns: 1 });

      expect(event.type).toBe('done');
      expect(event.usage?.inputTokens).toBe(12 + 300 + 5_000);
      expect(event.usage?.outputTokens).toBe(40);
    });

    it('counts cached prompt tokens as input on a failed turn', async () => {
      const [event] = await streamResult({ subtype: 'error_max_turns', errors: [] });

      expect(event.type).toBe('error');
      expect(event.usage?.inputTokens).toBe(12 + 300 + 5_000);
    });
  });

  describe('resumeSession', () => {
    it('should pass session ID and options to SDK resume', async () => {
      await executor.resumeSession('existing-session-id', {
        cwd: process.cwd(),
        model: 'claude-sonnet-4-6',
      });

      expect(mockResumeSession).toHaveBeenCalledWith(
        'existing-session-id',
        expect.objectContaining({
          allowedTools: expect.arrayContaining(['Bash', 'Read', 'Write']),
        })
      );
    });
  });
});
