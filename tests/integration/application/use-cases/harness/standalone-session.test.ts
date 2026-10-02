/**
 * Standalone harness sessions end to end (spec 119, F4/F7): run in a worktree,
 * resume, stop, apply to a branch, discard. The user's checkout never changes.
 */
import 'reflect-metadata';
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  HarnessSessionOrigin,
  HarnessSessionStatus,
  HarnessTaskStatus,
  HarnessMode,
} from '@/domain/generated/output.js';
import { RunHarnessTaskUseCase } from '@/application/use-cases/harness/run-harness-task.use-case.js';
import { ResumeHarnessSessionUseCase } from '@/application/use-cases/harness/resume-harness-session.use-case.js';
import { StopHarnessSessionUseCase } from '@/application/use-cases/harness/stop-harness-session.use-case.js';
import { ApplyHarnessSessionUseCase } from '@/application/use-cases/harness/apply-harness-session.use-case.js';
import { DiscardHarnessSessionUseCase } from '@/application/use-cases/harness/discard-harness-session.use-case.js';
import { HarnessSessionStateError } from '@/application/use-cases/harness/harness-errors.js';
import type { ScriptedTurn } from '@/infrastructure/services/harness/model/scripted-harness-model-provider.js';
import {
  createTempGitRepo,
  isolateGitEnv,
  type TempGitRepo,
} from '../../../../helpers/harness/temp-git-repo.js';
import {
  createUseCaseHarness,
  type UseCaseHarness,
} from '../../../../helpers/harness/use-case-harness.js';

const ORIGINAL = 'export function refresh(token: string) {\n  return token;\n}\n';
const EDIT: ScriptedTurn[] = [
  {
    toolCalls: [
      { name: 'use_capability', args: { capabilityId: 'apply_patch', intent: 'trim the token' } },
    ],
  },
  {
    toolCalls: [
      {
        name: 'apply_patch',
        args: {
          edits: [
            { path: 'src/refresh.ts', oldText: 'return token;', newText: 'return token.trim();' },
          ],
        },
      },
    ],
  },
  { toolCalls: [{ name: 'complete_task', args: { status: 'success', summary: 'Trimmed.' } }] },
];

const git = (cwd: string, ...args: string[]) =>
  execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

describe('standalone harness sessions', () => {
  let restoreEnv: () => void;
  let repo: TempGitRepo;
  let u: UseCaseHarness;
  let run: RunHarnessTaskUseCase;

  beforeAll(() => {
    restoreEnv = isolateGitEnv();
  });
  afterAll(() => restoreEnv());
  beforeEach(async () => {
    repo = createTempGitRepo({ 'src/refresh.ts': ORIGINAL });
    u = await createUseCaseHarness(repo.root);
    run = new RunHarnessTaskUseCase(u.service, u.workspaces);
  });
  afterEach(() => {
    u.cleanup();
    repo.cleanup();
  });

  it('runs in its own worktree and never touches the user checkout', async () => {
    u.script(EDIT);
    const result = await run.execute({
      repoRoot: repo.root,
      task: 'Make refresh trim the token',
      interactive: false,
    });

    expect(result.task.status).toBe(HarnessTaskStatus.Completed);
    expect(result.session.origin).toBe(HarnessSessionOrigin.Standalone);
    expect(result.session.worktreePath).toBeDefined();
    expect(result.session.worktreeBranch).toMatch(/^harness\//);
    expect(readFileSync(join(result.session.worktreePath!, 'src/refresh.ts'), 'utf8')).toContain(
      'token.trim()'
    );
    expect(readFileSync(join(repo.root, 'src/refresh.ts'), 'utf8')).toBe(ORIGINAL);
    expect(git(repo.root, 'status', '--porcelain')).toBe('');
  });

  it('applies the result as a commit on a named branch without switching the checkout', async () => {
    u.script(EDIT);
    const { session } = await run.execute({
      repoRoot: repo.root,
      task: 'Make refresh trim the token',
      interactive: false,
    });
    const before = git(repo.root, 'rev-parse', '--abbrev-ref', 'HEAD');

    const applied = await new ApplyHarnessSessionUseCase(u.h.store.sessions, u.workspaces).execute({
      sessionId: session.id,
      branch: 'fix/trim-token',
    });

    expect(applied.files).toEqual(['src/refresh.ts']);
    expect(git(repo.root, 'rev-parse', 'fix/trim-token')).toBe(applied.commit);
    expect(git(repo.root, 'show', 'fix/trim-token:src/refresh.ts')).toContain('token.trim()');
    expect(git(repo.root, 'rev-parse', '--abbrev-ref', 'HEAD')).toBe(before);
    expect(readFileSync(join(repo.root, 'src/refresh.ts'), 'utf8')).toBe(ORIGINAL);
    expect((await u.h.store.sessions.getSession(session.id))?.status).toBe(
      HarnessSessionStatus.Completed
    );
  });

  it('refuses to apply a session that changed nothing', async () => {
    u.script([]);
    const { session } = await run.execute({
      repoRoot: repo.root,
      task: 'Look around',
      interactive: false,
    });
    await expect(
      new ApplyHarnessSessionUseCase(u.h.store.sessions, u.workspaces).execute({
        sessionId: session.id,
      })
    ).rejects.toBeInstanceOf(HarnessSessionStateError);
  });

  it('discards the worktree but keeps the session state', async () => {
    u.script(EDIT);
    const { session, task } = await run.execute({
      repoRoot: repo.root,
      task: 'Make refresh trim the token',
      interactive: false,
    });

    const discarded = await new DiscardHarnessSessionUseCase(
      u.h.store.sessions,
      u.workspaces
    ).execute({ sessionId: session.id });

    expect(discarded.status).toBe(HarnessSessionStatus.Discarded);
    expect(existsSync(session.worktreePath!)).toBe(false);
    expect(await u.h.store.sessions.getTask(task.id)).not.toBeNull();
    await expect(
      new ResumeHarnessSessionUseCase(u.service, u.h.store.sessions).execute({
        sessionId: session.id,
        interactive: false,
      })
    ).rejects.toThrow(/discarded/);
  });

  it('resumes with a follow-up task in the same session and worktree', async () => {
    u.script(EDIT);
    const first = await run.execute({
      repoRoot: repo.root,
      task: 'Make refresh trim the token',
      interactive: false,
    });
    u.script([
      { toolCalls: [{ name: 'complete_task', args: { status: 'success', summary: 'Checked.' } }] },
    ]);

    const second = await new ResumeHarnessSessionUseCase(u.service, u.h.store.sessions).execute({
      sessionId: first.session.id,
      task: 'Double-check the edit',
      interactive: false,
    });

    expect(second.session.id).toBe(first.session.id);
    expect(await u.h.store.sessions.listTasks(first.session.id)).toHaveLength(2);
    expect(second.result.summary).toBe('Checked.');
  });

  it('stops a running task before its next turn (cross-process stop request)', async () => {
    const stop = new StopHarnessSessionUseCase(u.h.store.sessions, u.h.store.events);
    let sessionId = '';
    u.script((_req, i) => {
      if (i === 0) void stop.execute({ sessionId });
      return {
        text: 'thinking',
        toolCalls: [
          { name: 'use_capability', args: { capabilityId: 'list_files', intent: 'look' } },
        ],
      };
    });
    const result = await run.execute({
      repoRoot: repo.root,
      task: 'Loop forever',
      interactive: false,
      onSession: (s) => {
        sessionId = s.id;
      },
    });
    expect(result.task.status).toBe(HarnessTaskStatus.Cancelled);
    expect(result.result.summary).toBe('Stopped by the user.');
  });

  it('honours run overrides: shadow context routing executes as baseline', async () => {
    u.script([]);
    const { session } = await run.execute({
      repoRoot: repo.root,
      task: 'Look around',
      interactive: false,
      overrides: { shadow: { contextRouter: true } },
    });
    expect(session.mode).toBe(HarnessMode.Baseline);
    expect(session.shadowContext).toBe(true);
  });
});
