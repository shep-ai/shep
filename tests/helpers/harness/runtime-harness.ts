/**
 * Builds a HarnessRuntime wired to real infrastructure (in-memory SQLite,
 * in-memory blobs, builtin tools, YAML policy) for integration tests.
 */
import { randomUUID } from 'node:crypto';
import {
  HarnessMode,
  HarnessSessionOrigin,
  HarnessSessionStatus,
  type HarnessConfig,
  type HarnessSession,
} from '@/domain/generated/output.js';
import { resolveHarnessConfig } from '@/domain/harness/harness-config.js';
import type { IToolSource } from '@/application/ports/output/harness/index.js';
import {
  HarnessRuntime,
  type RunTaskInput,
} from '@/application/services/harness/harness-runtime.js';
import { GitRepoSnapshotter } from '@/infrastructure/services/harness/git-repo-snapshotter.js';
import { BuiltinToolSource } from '@/infrastructure/services/harness/tools/builtin-tool-source.js';
import { AjvToolArgumentValidator } from '@/infrastructure/services/harness/tools/ajv-tool-argument-validator.js';
import { YamlPolicyEngine } from '@/infrastructure/services/harness/policy/yaml-policy-engine.js';
import { ShellCommandInspector } from '@/infrastructure/services/harness/policy/shell-command-inspector.js';
import { FileSystemInstructionSource } from '@/infrastructure/services/harness/instructions/file-system-instruction-source.js';
import { DecisionProviderFactory } from '@/infrastructure/services/harness/decisions/decision-provider-factory.js';
import {
  ScriptedHarnessModelProvider,
  type ScriptedResponder,
  type ScriptedTurn,
} from '@/infrastructure/services/harness/model/scripted-harness-model-provider.js';
import { createHarnessTestStore, type HarnessTestStore } from './harness-test-store.js';

export interface RuntimeHarness {
  store: HarnessTestStore;
  runtime: HarnessRuntime;
  session(overrides?: Partial<HarnessSession>): Promise<HarnessSession>;
  run(
    session: HarnessSession,
    script: readonly ScriptedTurn[] | ScriptedResponder,
    overrides?: Partial<RunTaskInput>
  ): ReturnType<HarnessRuntime['runTask']> & Promise<unknown>;
  lastModel(): ScriptedHarnessModelProvider;
  config: HarnessConfig;
}

export async function createRuntimeHarness(
  repoRoot: string,
  options: { toolSources?: IToolSource[]; config?: Partial<HarnessConfig> } = {}
): Promise<RuntimeHarness> {
  const store = await createHarnessTestStore();
  const runtime = new HarnessRuntime({
    sessions: store.sessions,
    context: store.context,
    execution: store.execution,
    permissionRepo: store.permissions,
    events: store.events,
    blobs: store.blobs,
    snapshotter: new GitRepoSnapshotter(),
    toolSources: options.toolSources ?? [new BuiltinToolSource()],
    validator: new AjvToolArgumentValidator(),
    policy: new YamlPolicyEngine(),
    inspector: new ShellCommandInspector(),
    instructions: new FileSystemInstructionSource(),
    decisionFactory: new DecisionProviderFactory(),
    permissionPollMs: 5,
  });
  const config = resolveHarnessConfig(options.config as never);
  let model: ScriptedHarnessModelProvider | undefined;
  return {
    store,
    runtime,
    config,
    lastModel: () => model!,
    async session(overrides = {}) {
      const s: HarnessSession = {
        id: randomUUID(),
        status: HarnessSessionStatus.Active,
        origin: HarnessSessionOrigin.Standalone,
        mode: HarnessMode.QueryAware,
        repoRoot,
        title: 'test',
        shadowContext: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        ...overrides,
      };
      await store.sessions.createSession(s);
      return s;
    },
    run(session, script, overrides = {}) {
      model = new ScriptedHarnessModelProvider(script);
      return runtime.runTask({
        session,
        goal: 'Make refresh() trim the token and keep tests green',
        prompt: '## Task\nMake refresh() trim the token and keep tests green.\n',
        cwd: repoRoot,
        repoRoot,
        config,
        model,
        interactive: false,
        timeoutMs: 60_000,
        testCommand: 'echo 1 passed',
        ...overrides,
      });
    },
  };
}

/** Find chunk ids the context showed or indexed for a label fragment. */
export function chunkIdFor(userMessage: string, labelFragment: string): string | undefined {
  for (const m of userMessage.matchAll(/<chunk id="([^"]+)" kind="[^"]+" label="([^"]*)"/g)) {
    if (m[2].includes(labelFragment)) return m[1];
  }
  for (const m of userMessage.matchAll(/^([0-9a-f-]{36}) \S+ (.+)$/gm)) {
    if (m[2].includes(labelFragment)) return m[1];
  }
  return undefined;
}
