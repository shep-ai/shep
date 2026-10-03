/**
 * Harness use cases wired to real infrastructure for integration tests
 * (spec 119): in-memory SQLite store, real git worktrees in a temp dir, a
 * scripted model whose turns each test sets.
 */
import { execFile } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import type { Settings } from '@/domain/generated/output.js';
import type { ISettingsRepository } from '@/application/ports/output/repositories/settings.repository.interface.js';
import { HarnessTaskService } from '@/application/services/harness/harness-task-service.js';
import { WorktreeService } from '@/infrastructure/services/git/worktree.service.js';
import { GitHarnessWorkspaceService } from '@/infrastructure/services/harness/git-harness-workspace.service.js';
import { FileSystemHarnessProjectSetup } from '@/infrastructure/services/harness/file-system-harness-project-setup.js';
import { YamlPolicyEngine } from '@/infrastructure/services/harness/policy/yaml-policy-engine.js';
import { BuiltinToolSource } from '@/infrastructure/services/harness/tools/builtin-tool-source.js';
import {
  ScriptedHarnessModelProvider,
  type ScriptedResponder,
  type ScriptedTurn,
} from '@/infrastructure/services/harness/model/scripted-harness-model-provider.js';
import { createRuntimeHarness, type RuntimeHarness } from './runtime-harness.js';

export interface UseCaseHarness {
  h: RuntimeHarness;
  service: HarnessTaskService;
  workspaces: GitHarnessWorkspaceService;
  projectSetup: FileSystemHarnessProjectSetup;
  policy: YamlPolicyEngine;
  tools: BuiltinToolSource[];
  settings: ISettingsRepository;
  script(turns: readonly ScriptedTurn[] | ScriptedResponder): void;
  model(): ScriptedHarnessModelProvider;
  cleanup(): void;
}

export async function createUseCaseHarness(
  repoRoot: string,
  harness?: Settings['harness']
): Promise<UseCaseHarness> {
  const h = await createRuntimeHarness(repoRoot);
  const worktreeDir = mkdtempSync(join(tmpdir(), 'shep-harness-wt-'));
  const settings = {
    load: async () => ({ harness }) as Settings,
    initialize: async () => undefined,
    update: async () => undefined,
  } as unknown as ISettingsRepository;
  let turns: readonly ScriptedTurn[] | ScriptedResponder = [];
  let model: ScriptedHarnessModelProvider | undefined;
  const service = new HarnessTaskService(h.runtime, h.store.sessions, h.store.events, settings, {
    create: () => (model = new ScriptedHarnessModelProvider(turns)),
  });
  const worktrees = new WorktreeService(promisify(execFile) as never, {
    hasCreateHook: () => false,
    runCreateHook: async () => undefined,
    runPostCreateHook: async () => undefined,
  });
  const workspaces = new GitHarnessWorkspaceService(worktrees, {
    getWorktreePath: (_repo, branch) => join(worktreeDir, branch.replace(/\//g, '-')),
  });
  return {
    h,
    service,
    workspaces,
    projectSetup: new FileSystemHarnessProjectSetup(),
    policy: new YamlPolicyEngine(),
    tools: [new BuiltinToolSource()],
    settings,
    script: (t) => {
      turns = t;
    },
    model: () => model!,
    cleanup: () => {
      h.store.close();
      rmSync(worktreeDir, { recursive: true, force: true });
    },
  };
}
