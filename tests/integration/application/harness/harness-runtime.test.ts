/**
 * HarnessRuntime end to end with a scripted model on a real git repository
 * (spec 119, tasks 21-23).
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  ChunkVisibility,
  HarnessEventType,
  HarnessMode,
  HarnessTaskOutcome,
  HarnessTaskStatus,
  HarnessToolCallStatus,
  PermissionEffect,
} from '@/domain/generated/output.js';
import type { IToolSource } from '@/application/ports/output/harness/index.js';
import { BuiltinToolSource } from '@/infrastructure/services/harness/tools/builtin-tool-source.js';
import {
  createTempGitRepo,
  isolateGitEnv,
  type TempGitRepo,
} from '../../../helpers/harness/temp-git-repo.js';
import {
  chunkIdFor,
  createRuntimeHarness,
  type RuntimeHarness,
} from '../../../helpers/harness/runtime-harness.js';

const FILES = {
  'src/auth/refresh.ts': 'export function refresh(token: string) {\n  return token;\n}\n',
  'README.md': '# demo\n',
  'CLAUDE.md': '# Rules\nAlways keep tests green.\n',
};

const userMessage = (h: RuntimeHarness, i: number) => {
  const m = h.lastModel().requests[i].messages[0];
  return m.role === 'user' ? m.content : '';
};

describe('HarnessRuntime', () => {
  let restoreEnv: () => void;
  let repo: TempGitRepo;
  let h: RuntimeHarness;

  beforeAll(() => {
    restoreEnv = isolateGitEnv();
  });
  afterAll(() => restoreEnv());
  beforeEach(async () => {
    repo = createTempGitRepo(FILES);
    h = await createRuntimeHarness(repo.root);
  });
  afterEach(() => {
    h.store.close();
    repo.cleanup();
  });

  it('runs a query-aware task: tiered tools, a persisted plan per call, real edits, a structured result', async () => {
    const session = await h.session();
    const run = await h.run(session, [
      {
        text: 'Find the function.',
        toolCalls: [
          {
            name: 'use_capability',
            args: { capabilityId: 'search_source_code', intent: 'find refresh' },
          },
        ],
      },
      { toolCalls: [{ name: 'search_source', args: { query: 'function refresh' } }] },
      {
        toolCalls: [
          { name: 'use_capability', args: { capabilityId: 'apply_patch', intent: 'edit refresh' } },
        ],
      },
      {
        toolCalls: [
          {
            name: 'apply_patch',
            args: {
              edits: [
                {
                  path: 'src/auth/refresh.ts',
                  oldText: 'return token;',
                  newText: 'return token.trim();',
                },
              ],
            },
          },
        ],
      },
      {
        toolCalls: [
          { name: 'use_capability', args: { capabilityId: 'run_tests', intent: 'verify' } },
        ],
      },
      { toolCalls: [{ name: 'run_tests', args: {} }] },
      {
        toolCalls: [
          {
            name: 'complete_task',
            args: {
              status: 'success',
              summary: 'refresh() now trims the token.',
              evidence: [{ resource: 'src/auth/refresh.ts', startLine: 2, endLine: 2 }],
            },
          },
        ],
      },
    ]);

    expect(run.result).toMatchObject({
      status: HarnessTaskOutcome.Success,
      summary: 'refresh() now trims the token.',
    });
    expect(run.result.evidence[0]).toMatchObject({
      resource: 'src/auth/refresh.ts',
      repoSnapshotId: run.task.repoSnapshotId,
    });
    expect(run.task.status).toBe(HarnessTaskStatus.Completed);
    expect(readFileSync(join(repo.root, 'src/auth/refresh.ts'), 'utf8')).toContain('token.trim()');

    const requests = h.lastModel().requests;
    expect(requests[0].tools.map((t) => t.name)).toEqual([
      'use_capability',
      'expand_chunk',
      'complete_task',
    ]);
    expect(requests[1].tools.map((t) => t.name)).toEqual([
      'use_capability',
      'expand_chunk',
      'complete_task',
      'search_source',
    ]);
    // No transcript: every turn is one fresh user message.
    expect(requests.every((r) => r.messages.length === 1)).toBe(true);
    // Instructions sit in the stable prefix; capabilities as Tier-1 snippets only.
    expect(requests[0].system).toContain('Always keep tests green.');
    expect(requests[0].system).toContain('apply_patch(edits?, files?, patch?) — change files');
    expect(requests[0].system).not.toContain('"oldText"');

    const calls = await h.store.execution.listModelCalls(run.task.id);
    expect(calls).toHaveLength(7);
    for (const c of calls) {
      expect(c.contextPlanId).toBeTruthy();
      expect(await h.store.context.getPlan(c.contextPlanId!)).not.toBeNull();
    }
    expect(run.usage.turns).toBe(7);
    expect(run.usage.inputTokens).toBeGreaterThan(0);

    const tools = await h.store.execution.listToolCalls(run.task.id);
    expect(tools.map((t) => [t.capabilityId, t.status])).toEqual([
      ['search_source_code', HarnessToolCallStatus.Completed],
      ['apply_patch', HarnessToolCallStatus.Completed],
      ['run_tests', HarnessToolCallStatus.Completed],
    ]);
    for (const t of tools) {
      expect(t.permissionDecisionId).toBeTruthy();
      expect((await h.store.permissions.getPermission(t.permissionDecisionId!))?.result).toBe(
        PermissionEffect.Allow
      );
      expect(t.rawOutputChunkId).toBeTruthy();
    }
    // The search result chunk shows up in the next turn's context.
    expect(userMessage(h, 2)).toContain("search 'function refresh'");

    const types = (await h.store.events.listByTask(run.task.id)).map((e) => e.type);
    expect(types[0]).toBe(HarnessEventType.TaskCreated);
    expect(types).toContain(HarnessEventType.ContextPlanCreated);
    expect(types).toContain(HarnessEventType.ToolExecutionCompleted);
    expect(types[types.length - 1]).toBe(HarnessEventType.TaskCompleted);
  });

  it('expand_chunk shows more detail next turn without re-running the tool', async () => {
    const readSpy = vi.fn();
    const spying: IToolSource = {
      id: 'spy',
      discover: async () => {
        const catalog = await new BuiltinToolSource().discover();
        for (const e of catalog.executors) {
          if (e.implementation.capabilityId === 'read_file') {
            const original = e.execute.bind(e);
            e.execute = async (args, ctx) => {
              readSpy();
              return original(args, ctx);
            };
          }
        }
        return catalog;
      },
    };
    h.store.close();
    h = await createRuntimeHarness(repo.root, { toolSources: [spying] });
    const session = await h.session();
    let expandedId = '';
    await h.run(session, (req, i) => {
      const msg = req.messages[0].role === 'user' ? req.messages[0].content : '';
      if (i === 0)
        return {
          toolCalls: [
            { name: 'use_capability', args: { capabilityId: 'read_file', intent: 'read readme' } },
          ],
        };
      if (i === 1) return { toolCalls: [{ name: 'read_file', args: { path: 'README.md' } }] };
      if (i === 2) {
        expandedId = chunkIdFor(msg, 'README.md') ?? '';
        return {
          toolCalls: [{ name: 'expand_chunk', args: { chunkId: expandedId, level: 'full' } }],
        };
      }
      return { toolCalls: [{ name: 'complete_task', args: { status: 'success', summary: 'ok' } }] };
    });
    expect(expandedId).toBeTruthy();
    expect(readSpy).toHaveBeenCalledTimes(1);
    const plans = await h.store.context.listPlans(
      (await h.store.sessions.listTasks(session.id))[0].id
    );
    const last = plans[plans.length - 1].chunks.find((c) => c.chunkId === expandedId);
    expect(last).toMatchObject({ visibility: ChunkVisibility.Full, source: 'escalation' });
  });

  it('fails (never succeeds) when the turn limit is reached', async () => {
    h.config.maxTurns = 3;
    const session = await h.session();
    const run = await h.run(session, () => ({
      toolCalls: [{ name: 'use_capability', args: { capabilityId: 'list_files', intent: 'look' } }],
    }));
    expect(run.result.status).toBe(HarnessTaskOutcome.Failure);
    expect(run.result.summary).toMatch(/turn limit \(3\)/);
    expect(run.task.status).toBe(HarnessTaskStatus.Failed);
  });

  it('records denials and keeps going: git push is denied, an install asks and non-interactive turns it into deny', async () => {
    const session = await h.session();
    const run = await h.run(session, [
      {
        toolCalls: [
          {
            name: 'use_capability',
            args: { capabilityId: 'run_command', intent: 'push and install' },
          },
        ],
      },
      {
        toolCalls: [
          { name: 'run_command', args: { command: 'git push origin HEAD' } },
          { name: 'run_command', args: { command: 'pnpm add jsonwebtoken@9' } },
        ],
      },
      {
        toolCalls: [
          { name: 'complete_task', args: { status: 'partial', summary: 'Could not install.' } },
        ],
      },
    ]);
    const tools = await h.store.execution.listToolCalls(run.task.id);
    expect(tools.map((t) => t.status)).toEqual([
      HarnessToolCallStatus.Denied,
      HarnessToolCallStatus.Denied,
    ]);
    expect(tools[0].summary).toContain('Shep pushes and opens pull requests in the merge step');
    const perms = await h.store.permissions.listBySession(session.id);
    expect(perms.map((p) => p.reasonCode).sort()).toEqual(['non_interactive', 'policy_match']);
    expect(userMessage(h, 2)).toContain('Denied: git push origin HEAD');
  });

  it('rejects invalid tool arguments before execution', async () => {
    const session = await h.session();
    const run = await h.run(session, [
      {
        toolCalls: [
          { name: 'use_capability', args: { capabilityId: 'read_file', intent: 'read' } },
        ],
      },
      { toolCalls: [{ name: 'read_file', args: { path: 42 } }] },
      { toolCalls: [{ name: 'complete_task', args: { status: 'failure', summary: 'bad args' } }] },
    ]);
    const [call] = await h.store.execution.listToolCalls(run.task.id);
    expect(call.status).toBe(HarnessToolCallStatus.Invalid);
    expect(call.rawOutputChunkId).toBeUndefined();
    expect(call.permissionDecisionId).toBeUndefined();
  });

  it('baseline mode keeps a transcript, loads every schema and builds no plans; shadow plans never change its input', async () => {
    const script = [
      { toolCalls: [{ name: 'read_file', args: { path: 'README.md' } }] },
      { toolCalls: [{ name: 'complete_task', args: { status: 'success', summary: 'read it' } }] },
    ];
    const plain = await h.run(await h.session({ mode: HarnessMode.Baseline }), script);
    const plainRequests = h.lastModel().requests;
    expect(plainRequests[0].tools.map((t) => t.name).sort()).toEqual(
      [
        'apply_patch',
        'complete_task',
        'git_inspect',
        'list_files',
        'read_file',
        'run_command',
        'run_tests',
        'search_source',
      ].sort()
    );
    expect(plainRequests[1].messages.map((m) => m.role)).toEqual(['user', 'assistant', 'tool']);
    expect(await h.store.context.listPlans(plain.task.id)).toEqual([]);
    expect(
      (await h.store.execution.listModelCalls(plain.task.id)).every(
        (c) => c.contextPlanId === undefined
      )
    ).toBe(true);

    const shadow = await h.run(
      await h.session({ mode: HarnessMode.Baseline, shadowContext: true }),
      script
    );
    const shadowRequests = h.lastModel().requests;
    const plans = await h.store.context.listPlans(shadow.task.id);
    expect(plans.length).toBe(2);
    expect(plans.every((p) => p.shadow)).toBe(true);
    const strip = (s: string) => s.replace(/\[chunk [^\]]+\]/g, '');
    expect(shadowRequests.map((r) => strip(JSON.stringify(r.messages)))).toEqual(
      plainRequests.map((r) => strip(JSON.stringify(r.messages)))
    );
  });

  it('resumes after a crash: interrupted tasks fail, unknown side effects are not blindly replayed, drift is detected', async () => {
    const session = await h.session({ origin: 'feature' as never, agentRunId: 'run-1' });
    // First run reads the README, then the process "dies" mid apply_patch.
    await h.run(session, [
      {
        toolCalls: [
          { name: 'use_capability', args: { capabilityId: 'read_file', intent: 'read' } },
        ],
      },
      { toolCalls: [{ name: 'read_file', args: { path: 'README.md' } }] },
      { toolCalls: [{ name: 'complete_task', args: { status: 'success', summary: 'ok' } }] },
    ]);
    const [first] = await h.store.sessions.listTasks(session.id);
    const crashed = { ...first, id: 'crashed-task', status: HarnessTaskStatus.Running };
    await h.store.sessions.createTask(crashed);
    const patchArgs = { files: [{ path: 'NOTES.md', content: 'x' }] };
    const { canonicalJson, sha256Hex } = await import('@/domain/harness/fingerprints.js');
    await h.store.execution.putToolCall({
      id: 'tc-running',
      taskId: crashed.id,
      turn: 2,
      capabilityId: 'apply_patch',
      implementationId: 'builtin.apply_patch',
      arguments: patchArgs,
      argumentsHash: sha256Hex(canonicalJson(patchArgs)),
      idempotencyKey: 'k',
      status: HarnessToolCallStatus.Running,
      summary: 'apply_patch NOTES.md',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    repo.write('README.md', '# changed outside the agent\n');

    const resumed = await h.run(session, [
      {
        toolCalls: [
          {
            name: 'use_capability',
            args: { capabilityId: 'apply_patch', intent: 'write notes again' },
          },
        ],
      },
      { toolCalls: [{ name: 'apply_patch', args: patchArgs }] },
      {
        toolCalls: [
          { name: 'complete_task', args: { status: 'partial', summary: 'needs approval' } },
        ],
      },
    ]);

    expect(await h.store.sessions.getTask('crashed-task')).toMatchObject({
      status: HarnessTaskStatus.Failed,
      failureReason: expect.stringContaining('Interrupted'),
    });
    expect((await h.store.execution.getToolCall('tc-running'))?.status).toBe(
      HarnessToolCallStatus.Unknown
    );
    // The repeat of the unknown write was not executed without a person saying so.
    const [repeat] = await h.store.execution.listToolCalls(resumed.task.id);
    expect(repeat.status).toBe(HarnessToolCallStatus.Denied);
    const perm = await h.store.permissions.getPermission(repeat.permissionDecisionId!);
    expect(perm?.effects.map((e) => e.category)).toContain('unknown');
    // A recovery note is pinned into the new task's context, no transcript replayed.
    expect(userMessage(h, 0)).toContain('Recovery note');
    expect(userMessage(h, 0)).toContain('apply_patch NOTES.md');
    // Drift since the last snapshot was detected and stale chunks dropped out.
    const events = await h.store.events.listAfter(session.id, 0, 1000);
    const drift = events.find((e) => e.type === HarnessEventType.RepoDriftDetected);
    expect(drift?.payload.changedPaths).toEqual(['README.md']);
    const readmeChunks = (await h.store.context.listChunks({ sessionId: session.id })).filter(
      (c) => c.path === 'README.md'
    );
    expect(readmeChunks.every((c) => c.tags.includes('stale'))).toBe(true);
  });

  it('load-and-call: use_capability with args runs the tool in the same turn', async () => {
    const session = await h.session();
    const run = await h.run(session, [
      {
        toolCalls: [
          {
            name: 'use_capability',
            args: {
              capabilityId: 'read_file',
              intent: 'read refresh',
              args: { path: 'src/auth/refresh.ts' },
            },
          },
        ],
      },
      { toolCalls: [{ name: 'complete_task', args: { status: 'success', summary: 'Read it.' } }] },
    ]);
    const tools = await h.store.execution.listToolCalls(run.task.id);
    expect(tools.map((t) => [t.turn, t.capabilityId, t.status])).toEqual([
      [1, 'read_file', HarnessToolCallStatus.Completed],
    ]);
    // The result is in the very next turn's context, and the tool stays loaded.
    expect(userMessage(h, 1)).toContain('return token;');
    expect(h.lastModel().requests[1].tools.map((t) => t.name)).toContain('read_file');
  });

  it('keeps tool-call-only responses out of later context (the ledger covers them)', async () => {
    const session = await h.session();
    await h.run(session, [
      {
        toolCalls: [
          {
            name: 'use_capability',
            args: { capabilityId: 'list_files', intent: 'look', args: {} },
          },
        ],
      },
      { toolCalls: [{ name: 'complete_task', args: { status: 'success', summary: 'ok' } }] },
    ]);
    expect(userMessage(h, 1)).not.toContain('kind="assistant_message"');
  });
});
