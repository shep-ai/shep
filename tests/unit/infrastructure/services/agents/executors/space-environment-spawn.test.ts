/**
 * Spec 123: a one-off agent call (an investigation inside the long-lived web
 * server or daemon) carries its space's environment in the execution options,
 * and every subprocess executor applies it to the agent process it spawns —
 * without touching the server's own process.env.
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { SpawnFunction } from '@/infrastructure/services/agents/common/types.js';
import type { IAgentExecutor } from '@/application/ports/output/agents/agent-executor.interface.js';
import type { SpaceEnvironment } from '@/domain/shared/space-environment.js';
import { ClaudeCodeExecutorService } from '@/infrastructure/services/agents/common/executors/claude-code-executor.service.js';
import { ClineExecutorService } from '@/infrastructure/services/agents/common/executors/cline-executor.service.js';
import { CursorExecutorService } from '@/infrastructure/services/agents/common/executors/cursor-executor.service.js';
import { GeminiCliExecutorService } from '@/infrastructure/services/agents/common/executors/gemini-cli-executor.service.js';
import { CopilotCliExecutorService } from '@/infrastructure/services/agents/common/executors/copilot-cli-executor.service.js';
import { KimiCodeExecutorService } from '@/infrastructure/services/agents/common/executors/kimi-code-executor.service.js';
import { CodexCliExecutorService } from '@/infrastructure/services/agents/common/executors/codex-cli-executor.service.js';

const SPAWN_REFUSED = 'spawn refused by test';

const ENVIRONMENT: SpaceEnvironment = {
  set: { GIT_AUTHOR_NAME: 'Work Me' },
  unset: ['GH_TOKEN'],
};

const EXECUTORS: [string, (spawn: SpawnFunction) => IAgentExecutor][] = [
  ['claude-code', (spawn) => new ClaudeCodeExecutorService(spawn)],
  ['cline', (spawn) => new ClineExecutorService(spawn)],
  ['cursor', (spawn) => new CursorExecutorService(spawn)],
  ['gemini-cli', (spawn) => new GeminiCliExecutorService(spawn)],
  ['copilot-cli', (spawn) => new CopilotCliExecutorService(spawn)],
  ['kimi-code', (spawn) => new KimiCodeExecutorService(spawn)],
  ['codex-cli', (spawn) => new CodexCliExecutorService(spawn)],
];

describe('space environment in execution options', () => {
  beforeEach(() => {
    vi.stubEnv('GH_TOKEN', 'server-token');
    vi.stubEnv('GIT_AUTHOR_NAME', 'Server');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each(EXECUTORS)('%s spawns the agent with the space environment', async (_name, make) => {
    const spawn = vi.fn(() => {
      throw new Error(SPAWN_REFUSED);
    }) as unknown as SpawnFunction;

    await make(spawn)
      .execute('hello', { cwd: process.cwd(), environment: ENVIRONMENT })
      .catch(() => undefined);

    const calls = (spawn as unknown as { mock: { calls: unknown[][] } }).mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    const env = (calls.at(-1)?.[2] as { env: NodeJS.ProcessEnv }).env;
    expect(env.GIT_AUTHOR_NAME).toBe('Work Me');
    expect(env).not.toHaveProperty('GH_TOKEN');
    expect(process.env.GH_TOKEN).toBe('server-token');
  });

  it.each(EXECUTORS)('%s inherits the server environment without one', async (_name, make) => {
    const spawn = vi.fn(() => {
      throw new Error(SPAWN_REFUSED);
    }) as unknown as SpawnFunction;

    await make(spawn)
      .execute('hello', { cwd: process.cwd() })
      .catch(() => undefined);

    const calls = (spawn as unknown as { mock: { calls: unknown[][] } }).mock.calls;
    const env = (calls.at(-1)?.[2] as { env: NodeJS.ProcessEnv }).env;
    expect(env.GH_TOKEN).toBe('server-token');
    expect(env.GIT_AUTHOR_NAME).toBe('Server');
  });
});
