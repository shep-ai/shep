/**
 * Harness inspection and control use cases (spec 119, F2/F5/F6): session
 * detail, plans, chunk views, "Why?", "Include from next turn", permissions,
 * capabilities, policies and repository setup.
 */
import 'reflect-metadata';
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  ChunkVisibility,
  GrantScope,
  HarnessDecisionKind,
  HarnessSessionOrigin,
  HarnessToolCallStatus,
  PermissionEffect,
  PermissionRequestStatus,
} from '@/domain/generated/output.js';
import { GetHarnessSessionUseCase } from '@/application/use-cases/harness/get-harness-session.use-case.js';
import { ListHarnessSessionsUseCase } from '@/application/use-cases/harness/list-harness-sessions.use-case.js';
import { GetContextPlanUseCase } from '@/application/use-cases/harness/get-context-plan.use-case.js';
import { RenderChunkViewUseCase } from '@/application/use-cases/harness/render-chunk-view.use-case.js';
import { ExplainHarnessDecisionUseCase } from '@/application/use-cases/harness/explain-harness-decision.use-case.js';
import { OverrideChunkVisibilityUseCase } from '@/application/use-cases/harness/override-chunk-visibility.use-case.js';
import { ListHarnessPermissionsUseCase } from '@/application/use-cases/harness/list-harness-permissions.use-case.js';
import { ResolveHarnessPermissionUseCase } from '@/application/use-cases/harness/resolve-harness-permission.use-case.js';
import { ListHarnessCapabilitiesUseCase } from '@/application/use-cases/harness/list-harness-capabilities.use-case.js';
import { GetHarnessPoliciesUseCase } from '@/application/use-cases/harness/get-harness-policies.use-case.js';
import { InitHarnessProjectUseCase } from '@/application/use-cases/harness/init-harness-project.use-case.js';
import { HarnessNotFoundError } from '@/application/use-cases/harness/harness-errors.js';
import {
  createTempGitRepo,
  isolateGitEnv,
  type TempGitRepo,
} from '../../../../helpers/harness/temp-git-repo.js';
import {
  createUseCaseHarness,
  type UseCaseHarness,
} from '../../../../helpers/harness/use-case-harness.js';

const FILES = {
  'src/refresh.ts': 'export function refresh(token: string) {\n  return token;\n}\n',
  'package.json': JSON.stringify({
    name: 'demo',
    scripts: { test: 'vitest run', lint: 'eslint .' },
  }),
  'CLAUDE.md': '# Rules\nKeep tests green.\n',
  '.env': 'SECRET=1\n',
  '.env.example': 'SECRET=\n',
};

describe('harness inspection and control use cases', () => {
  let restoreEnv: () => void;
  let repo: TempGitRepo;
  let u: UseCaseHarness;

  beforeAll(() => {
    restoreEnv = isolateGitEnv();
  });
  afterAll(() => restoreEnv());
  beforeEach(async () => {
    repo = createTempGitRepo(FILES);
    u = await createUseCaseHarness(repo.root);
  });
  afterEach(() => {
    u.cleanup();
    repo.cleanup();
  });

  const searchThenDone = async () => {
    u.script([
      {
        toolCalls: [
          {
            name: 'use_capability',
            args: { capabilityId: 'search_source_code', intent: 'find refresh' },
          },
        ],
      },
      { toolCalls: [{ name: 'search_source', args: { query: 'function refresh' } }] },
      { toolCalls: [{ name: 'complete_task', args: { status: 'success', summary: 'Found it.' } }] },
    ]);
    return u.service.execute({
      prompt: '## Task\nFind refresh.',
      cwd: repo.root,
      agentRunId: 'run-1',
      featureId: 'feat-1',
      phase: 'analyze',
      interactive: false,
    });
  };

  it('returns session detail by session id or AgentRun id, with per-task usage and plans', async () => {
    const run = await searchThenDone();
    const get = new GetHarnessSessionUseCase(
      u.h.store.sessions,
      u.h.store.execution,
      u.h.store.context,
      u.h.store.permissions
    );

    const bySession = await get.execute({ id: run.session.id });
    const byRun = await get.execute({ id: 'run-1' });

    expect(byRun.session.id).toBe(bySession.session.id);
    expect(bySession.tasks).toHaveLength(1);
    const [task] = bySession.tasks;
    expect(task.usage.turns).toBe(3);
    expect(task.plans.map((p) => p.turn)).toEqual([1, 2, 3]);
    expect(task.toolCalls.map((t) => t.status)).toEqual([HarnessToolCallStatus.Completed]);
    expect(bySession.usage.inputTokens).toBeGreaterThan(0);
    await expect(get.execute({ id: 'nope' })).rejects.toBeInstanceOf(HarnessNotFoundError);

    const list = await new ListHarnessSessionsUseCase(
      u.h.store.sessions,
      u.h.store.permissions
    ).execute({ featureId: 'feat-1' });
    expect(list.map((i) => i.session.id)).toEqual([run.session.id]);
    expect(list[0].taskCount).toBe(1);
  });

  it('shows what the model saw, renders chunk views from stored raw output, and explains a row', async () => {
    const run = await searchThenDone();
    const planUc = new GetContextPlanUseCase(u.h.store.context);
    const { plan, summary } = await planUc.execute({ taskId: run.task.id });
    expect(plan.turn).toBe(3);
    expect(
      summary.histogram[ChunkVisibility.Full] +
        summary.histogram[ChunkVisibility.Long] +
        summary.histogram[ChunkVisibility.Short]
    ).toBeGreaterThan(0);
    expect((await planUc.execute({ taskId: run.task.id, turn: 1 })).plan.turn).toBe(1);

    const searchRow = plan.chunks.find((c) => c.label.includes('function refresh'))!;
    expect(searchRow).toBeDefined();
    const render = new RenderChunkViewUseCase(u.h.store.context, u.h.store.blobs);
    const full = await render.execute({
      chunkId: searchRow.chunkId,
      visibility: ChunkVisibility.Full,
    });
    const short = await render.execute({
      chunkId: searchRow.chunkId,
      visibility: ChunkVisibility.Short,
    });
    expect(full.content).toContain('src/refresh.ts');
    expect(short.content.length).toBeLessThanOrEqual(full.content.length + 200);

    const explain = new ExplainHarnessDecisionUseCase(
      u.h.store.execution,
      u.h.store.context,
      u.h.store.permissions,
      u.policy,
      u.h.store.sessions,
      u.settings
    );
    const why = await explain.execute({ planId: plan.id, chunkId: searchRow.chunkId });
    expect(why.planned?.visibility).toBe(searchRow.visibility);
    expect(why.bands).toEqual({ hide: 0.1, long: 0.45, full: 0.8 });
    expect(why.sourceIds).toMatchObject({
      contextPlanId: plan.id,
      taskId: run.task.id,
      chunkIds: [searchRow.chunkId],
    });
    if (searchRow.decisionId) {
      const byId = await explain.execute({ decisionId: searchRow.decisionId });
      expect(byId.decision?.kind).toBe(HarnessDecisionKind.ChunkVisibility);
    }
  });

  it('records "Include from next turn" as a user decision the next turn honours', async () => {
    const first = await searchThenDone();
    const { plan } = await new GetContextPlanUseCase(u.h.store.context).execute({
      taskId: first.task.id,
      turn: 1,
    });
    const chunkId = plan.chunks[0].chunkId;

    const decision = await new OverrideChunkVisibilityUseCase(
      u.h.store.context,
      u.h.store.sessions,
      u.h.store.execution,
      u.h.store.blobs,
      u.h.store.events
    ).execute({ planId: plan.id, chunkId, include: true });

    expect(decision).toMatchObject({
      providerId: 'user',
      kind: HarnessDecisionKind.ChunkVisibility,
      taskId: first.task.id,
      contextPlanId: plan.id,
    });
    expect(decision.result).toEqual({ chunkId, include: true });
  });

  it('lists pending permission requests with user-vocabulary scopes and resolves them', async () => {
    u.script([
      {
        toolCalls: [
          { name: 'use_capability', args: { capabilityId: 'run_command', intent: 'install jose' } },
        ],
      },
      { toolCalls: [{ name: 'run_command', args: { command: 'pnpm add jose' } }] },
      { toolCalls: [{ name: 'complete_task', args: { status: 'success', summary: 'ok' } }] },
    ]);
    const running = u.service.execute({
      prompt: 'Add jose',
      cwd: repo.root,
      agentRunId: 'run-2',
      interactive: true,
    });
    const list = new ListHarnessPermissionsUseCase(u.h.store.permissions, u.h.store.sessions);
    let pending = await list.execute();
    for (let i = 0; pending.length === 0 && i < 200; i++) {
      await new Promise((r) => setTimeout(r, 10));
      pending = await list.execute();
    }
    expect(pending).toHaveLength(1);
    expect(pending[0].session?.origin).toBe(HarnessSessionOrigin.Feature);
    expect(pending[0].scopes).toEqual([GrantScope.Once, GrantScope.Task, GrantScope.Session]);
    expect(pending[0].approvable).toBe(true);
    expect(pending[0].decision.effects.map((e) => e.category)).toContain('network');

    const resolved = await new ResolveHarnessPermissionUseCase(
      u.policy,
      u.h.store.permissions,
      u.h.store.events
    ).execute({
      id: pending[0].decision.id,
      allow: false,
      note: 'Use the jose already in the lockfile',
    });
    expect(resolved).toMatchObject({
      status: PermissionRequestStatus.Resolved,
      result: PermissionEffect.Deny,
    });
    const done = await running;
    const denied = (await u.h.store.execution.listToolCalls(done.task.id)).find(
      (t) => t.capabilityId === 'run_command'
    );
    expect(denied?.status).toBe(HarnessToolCallStatus.Denied);
    expect(denied?.summary).toContain('Use the jose already in the lockfile');

    const log = await list.execute({ sessionId: done.session.id, includeResolved: true });
    expect(log).toHaveLength(1);
  });

  it('lists capabilities with tiered token costs and the effective policy rules', async () => {
    const caps = await new ListHarnessCapabilitiesUseCase(u.tools).execute();
    expect(caps.map((c) => c.capability.id)).toContain('apply_patch');
    for (const c of caps) expect(c.schemaTokens).toBeGreaterThan(c.snippetTokens / 4);

    const policies = await new GetHarnessPoliciesUseCase(u.policy).execute({ repoRoot: repo.root });
    expect(policies.rules.map((r) => r.id)).toContain('deny-git-push');
    expect(policies.issues).toEqual([]);
  });

  it('previews repository setup without writing, then writes only under .shep/harness on confirm', async () => {
    const init = new InitHarnessProjectUseCase(u.projectSetup);
    const preview = await init.execute({ repoRoot: repo.root, confirm: false });

    expect(preview.written).toEqual([]);
    expect(existsSync(join(repo.root, '.shep'))).toBe(false);
    expect(preview.inspection).toMatchObject({
      instructionFiles: ['CLAUDE.md'],
      manifests: ['package.json'],
      testCommand: 'npm test',
      lintCommand: 'npm run lint',
      sensitivePaths: ['.env'],
    });
    expect(preview.files.map((f) => f.path)).toEqual([
      '.shep/harness/config.yaml',
      '.shep/harness/policies/default.yaml',
      '.shep/harness/instructions/README.md',
    ]);

    const written = await init.execute({ repoRoot: repo.root, confirm: true });
    expect(written.written).toHaveLength(3);
    expect(readFileSync(join(repo.root, '.shep/harness/config.yaml'), 'utf8')).toContain(
      'test_command: "npm test"'
    );
    const policies = await new GetHarnessPoliciesUseCase(u.policy).execute({ repoRoot: repo.root });
    expect(policies.issues).toEqual([]);
    expect(policies.rules.map((r) => r.id)).toContain('deny-repo-sensitive-files');

    // Existing files are kept as they are.
    writeFileSync(
      join(repo.root, '.shep/harness/config.yaml'),
      'version: 1\ntest_command: "custom"\n'
    );
    const again = await init.execute({ repoRoot: repo.root, confirm: true });
    expect(again.written).toEqual([]);
    expect(again.files[0]).toMatchObject({
      exists: true,
      content: 'version: 1\ntest_command: "custom"\n',
    });
  });
});
