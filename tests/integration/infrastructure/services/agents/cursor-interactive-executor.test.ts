/**
 * CursorInteractiveExecutor against a real child process.
 *
 * `cursor-agent` is replaced by a Node fixture that serves ACP on its stdio
 * (fixtures/fake-cursor-acp-agent.mjs). Everything else is production code:
 * the factory, the Cursor profile, the ACP session and Node's `spawn`. This is
 * where LESSONS.md's hard requirement for chat is checked — one agent process
 * per session, same PID for every turn — along with the teardown the unit
 * fakes can only simulate.
 */

import 'reflect-metadata';
import { spawn, type SpawnOptions } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { AgentExecutorFactory } from '@/infrastructure/services/agents/common/agent-executor-factory.service.js';
import type { SpawnFunction } from '@/infrastructure/services/agents/common/types.js';
import { AgentAuthMethod, AgentType } from '@/domain/generated/output.js';
import type {
  InteractiveAgentEvent,
  InteractiveAgentSessionHandle,
} from '@/application/ports/output/agents/interactive-agent-executor.interface.js';
import { removeDirWithRetry } from '@tests/helpers/remove-dir.helper.js';

const FIXTURE = fileURLToPath(new URL('./fixtures/fake-cursor-acp-agent.mjs', import.meta.url));
const CURSOR_CONFIG = { type: AgentType.Cursor, authMethod: AgentAuthMethod.Session };

/** Send one message and return the turn's answer text. */
async function ask(handle: InteractiveAgentSessionHandle, message: string): Promise<string> {
  await handle.send(message);
  const events: InteractiveAgentEvent[] = [];
  for await (const event of handle.stream()) events.push(event);
  expect(events.at(-1)?.type, JSON.stringify(events)).toBe('done');
  return events
    .filter((e) => e.type === 'delta')
    .map((e) => e.content)
    .join('');
}

const pidOf = (answer: string): number => Number(/pid:(\d+)/.exec(answer)?.[1]);

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

describe('CursorInteractiveExecutor (real subprocess)', () => {
  let stateDir: string;
  let workDir: string;
  let launches: { command: string; args: string[] }[];
  let factory: AgentExecutorFactory;

  beforeEach(() => {
    stateDir = mkdtempSync(join(tmpdir(), 'shep-acp-state-'));
    workDir = mkdtempSync(join(tmpdir(), 'shep-acp-work-'));
    launches = [];
    // Route the Cursor launch (direct, or via cmd.exe on Windows) to the fixture.
    const spawnFixture: SpawnFunction = (command, args, options) => {
      launches.push({ command, args });
      const base = (options ?? {}) as SpawnOptions;
      const env: NodeJS.ProcessEnv = { ...(base.env ?? process.env), FAKE_ACP_STATE_DIR: stateDir };
      return spawn(process.execPath, [FIXTURE], { ...base, env });
    };
    factory = new AgentExecutorFactory(spawnFixture);
  });

  afterEach(() => {
    removeDirWithRetry(stateDir);
    removeDirWithRetry(workDir);
  });

  it('answers every turn of a chat from one agent process and stops it on close', async () => {
    const executor = factory.createInteractiveExecutor(AgentType.Cursor, CURSOR_CONFIG);
    const handle = await executor.createSession({ cwd: workDir });

    const first = await ask(handle, 'first');
    const second = await ask(handle, 'second');

    expect(first).toContain('echo:first');
    expect(second).toContain('echo:second');
    const pid = pidOf(first);
    expect(pidOf(second)).toBe(pid);
    expect(launches).toHaveLength(1);
    expect(isAlive(pid)).toBe(true);

    await handle.close();

    expect(isAlive(pid)).toBe(false);
  });

  it('resumes the same conversation in a new process after the session was closed', async () => {
    const executor = factory.createInteractiveExecutor(AgentType.Cursor, CURSOR_CONFIG);
    const original = await executor.createSession({ cwd: workDir });
    const firstPid = pidOf(await ask(original, 'before restart'));
    const sessionId = original.sessionId;
    await original.close();

    const resumed = await executor.resumeSession(sessionId, { cwd: workDir });
    try {
      const answer = await ask(resumed, 'after restart');

      expect(resumed.sessionId).toBe(sessionId);
      expect(answer).toContain('echo:after restart');
      expect(pidOf(answer)).not.toBe(firstPid);
    } finally {
      await resumed.close();
    }
  });
});
