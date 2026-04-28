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

      expect(capturedOptions.model).toBe('claude-sonnet-4-6');
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
