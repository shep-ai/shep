/**
 * DI registrations for the query-aware agent harness (spec 119).
 *
 * Every harness port is registered under its HARNESS_TOKENS string token.
 * Registrations are lazy factories: nothing touches the filesystem until a
 * harness component is first resolved.
 */
import { join } from 'node:path';
import type { DependencyContainer } from 'tsyringe';
import type Database from 'better-sqlite3';

import {
  HARNESS_TOKENS,
  type IBlobStore,
  type IHarnessContextRepository,
  type IHarnessEvalRepository,
  type IHarnessEventLog,
  type IHarnessExecutionRepository,
  type IHarnessPermissionRepository,
  type IHarnessSessionRepository,
  type IRepoSnapshotter,
  type ICommandInspector,
  type IDecisionProviderFactory,
  type IPolicyEngine,
  type IToolArgumentValidator,
  type IToolSource,
  type IInstructionSource,
  type IHarnessModelProviderFactory,
  type IHarnessProjectSetup,
  type IHarnessWorkspaceService,
  type IHarnessEnvironmentProbe,
  type IHarnessEvalSuiteSource,
  type IHarnessEvalWorkspaceFactory,
} from '../../../application/ports/output/harness/index.js';
import type { ISettingsRepository } from '../../../application/ports/output/repositories/settings.repository.interface.js';
import { HarnessRuntime } from '../../../application/services/harness/harness-runtime.js';
import { HarnessTaskService } from '../../../application/services/harness/harness-task-service.js';
import { HarnessModelProviderFactory } from '../../services/harness/model/harness-model-provider-factory.js';
import { ScriptedHarnessModelProvider } from '../../services/harness/model/scripted-harness-model-provider.js';
import { GitHarnessWorkspaceService } from '../../services/harness/git-harness-workspace.service.js';
import { FileSystemHarnessProjectSetup } from '../../services/harness/file-system-harness-project-setup.js';
import { HarnessEnvironmentProbe } from '../../services/harness/harness-environment-probe.js';
import type { IWorktreeService } from '../../../application/ports/output/services/worktree-service.interface.js';
import type { IWorktreePathProvider } from '../../../application/ports/output/services/worktree-path-provider.interface.js';
import { ApplyHarnessSessionUseCase } from '../../../application/use-cases/harness/apply-harness-session.use-case.js';
import { DiscardHarnessSessionUseCase } from '../../../application/use-cases/harness/discard-harness-session.use-case.js';
import { ExplainHarnessDecisionUseCase } from '../../../application/use-cases/harness/explain-harness-decision.use-case.js';
import { GetContextPlanUseCase } from '../../../application/use-cases/harness/get-context-plan.use-case.js';
import { GetHarnessPoliciesUseCase } from '../../../application/use-cases/harness/get-harness-policies.use-case.js';
import { GetHarnessSessionUseCase } from '../../../application/use-cases/harness/get-harness-session.use-case.js';
import { InitHarnessProjectUseCase } from '../../../application/use-cases/harness/init-harness-project.use-case.js';
import { ListHarnessCapabilitiesUseCase } from '../../../application/use-cases/harness/list-harness-capabilities.use-case.js';
import { ListHarnessEventsUseCase } from '../../../application/use-cases/harness/list-harness-events.use-case.js';
import { ListHarnessPermissionsUseCase } from '../../../application/use-cases/harness/list-harness-permissions.use-case.js';
import { ListHarnessSessionsUseCase } from '../../../application/use-cases/harness/list-harness-sessions.use-case.js';
import { OverrideChunkVisibilityUseCase } from '../../../application/use-cases/harness/override-chunk-visibility.use-case.js';
import { PromoteHarnessSessionUseCase } from '../../../application/use-cases/harness/promote-harness-session.use-case.js';
import { RenderChunkViewUseCase } from '../../../application/use-cases/harness/render-chunk-view.use-case.js';
import { ResolveHarnessPermissionUseCase } from '../../../application/use-cases/harness/resolve-harness-permission.use-case.js';
import { ResumeHarnessSessionUseCase } from '../../../application/use-cases/harness/resume-harness-session.use-case.js';
import { RunHarnessTaskUseCase } from '../../../application/use-cases/harness/run-harness-task.use-case.js';
import { RunHarnessEvalUseCase } from '../../../application/use-cases/harness/run-harness-eval.use-case.js';
import {
  GetHarnessEvalReportUseCase,
  ListHarnessEvalRunsUseCase,
} from '../../../application/use-cases/harness/harness-eval-report.use-cases.js';
import { SaveHarnessEvalCaseUseCase } from '../../../application/use-cases/harness/save-harness-eval-case.use-case.js';
import { YamlHarnessEvalSuiteSource } from '../../services/harness/evals/yaml-eval-suite-source.js';
import { TempGitEvalWorkspaceFactory } from '../../services/harness/evals/temp-git-eval-workspace.js';
import { StopHarnessSessionUseCase } from '../../../application/use-cases/harness/stop-harness-session.use-case.js';

/** Harness use cases, registered by class and by class-name string token. */
const HARNESS_USE_CASES = {
  ApplyHarnessSessionUseCase,
  DiscardHarnessSessionUseCase,
  ExplainHarnessDecisionUseCase,
  GetContextPlanUseCase,
  GetHarnessEvalReportUseCase,
  GetHarnessPoliciesUseCase,
  GetHarnessSessionUseCase,
  InitHarnessProjectUseCase,
  ListHarnessCapabilitiesUseCase,
  ListHarnessEvalRunsUseCase,
  ListHarnessEventsUseCase,
  ListHarnessPermissionsUseCase,
  ListHarnessSessionsUseCase,
  OverrideChunkVisibilityUseCase,
  PromoteHarnessSessionUseCase,
  RenderChunkViewUseCase,
  ResolveHarnessPermissionUseCase,
  ResumeHarnessSessionUseCase,
  RunHarnessEvalUseCase,
  RunHarnessTaskUseCase,
  SaveHarnessEvalCaseUseCase,
  StopHarnessSessionUseCase,
} as const;

/** String tokens of the harness use cases (web routes and server actions resolve these). */
export const HARNESS_USE_CASE_TOKENS = Object.keys(HARNESS_USE_CASES);
import { DecisionProviderFactory } from '../../services/harness/decisions/decision-provider-factory.js';
import { BuiltinToolSource } from '../../services/harness/tools/builtin-tool-source.js';
import { AjvToolArgumentValidator } from '../../services/harness/tools/ajv-tool-argument-validator.js';
import { YamlPolicyEngine } from '../../services/harness/policy/yaml-policy-engine.js';
import { ShellCommandInspector } from '../../services/harness/policy/shell-command-inspector.js';
import { FileSystemInstructionSource } from '../../services/harness/instructions/file-system-instruction-source.js';
import { getShepHomeDir } from '../../services/filesystem/shep-directory.service.js';
import { FileSystemBlobStore } from '../../services/harness/storage/file-system-blob-store.js';
import { GitRepoSnapshotter } from '../../services/harness/git-repo-snapshotter.js';
import { SQLiteHarnessSessionRepository } from '../../repositories/harness/sqlite-harness-session.repository.js';
import { SQLiteHarnessContextRepository } from '../../repositories/harness/sqlite-harness-context.repository.js';
import { SQLiteHarnessExecutionRepository } from '../../repositories/harness/sqlite-harness-execution.repository.js';
import { SQLiteHarnessPermissionRepository } from '../../repositories/harness/sqlite-harness-permission.repository.js';
import { SQLiteHarnessEvalRepository } from '../../repositories/harness/sqlite-harness-eval.repository.js';
import { SqliteHarnessEventLog } from '../../repositories/harness/sqlite-harness-event-log.js';

/** Directory (under SHEP_HOME) holding content-addressed harness blobs. */
export const HARNESS_OBJECTS_DIR = 'objects';

export function registerHarness(container: DependencyContainer): void {
  const db = (c: DependencyContainer) => c.resolve<Database.Database>('Database');

  // ─── Storage ─────────────────────────────────────────────────────────────
  let blobStore: IBlobStore | undefined;
  container.register<IBlobStore>(HARNESS_TOKENS.BlobStore, {
    useFactory: () =>
      (blobStore ??= new FileSystemBlobStore(join(getShepHomeDir(), HARNESS_OBJECTS_DIR))),
  });
  container.register<IRepoSnapshotter>(HARNESS_TOKENS.RepoSnapshotter, {
    useFactory: () => new GitRepoSnapshotter(),
  });

  // ─── Repositories ────────────────────────────────────────────────────────
  container.register<IHarnessSessionRepository>(HARNESS_TOKENS.SessionRepository, {
    useFactory: (c) => new SQLiteHarnessSessionRepository(db(c)),
  });
  container.register<IHarnessContextRepository>(HARNESS_TOKENS.ContextRepository, {
    useFactory: (c) => new SQLiteHarnessContextRepository(db(c)),
  });
  container.register<IHarnessExecutionRepository>(HARNESS_TOKENS.ExecutionRepository, {
    useFactory: (c) => new SQLiteHarnessExecutionRepository(db(c)),
  });
  container.register<IHarnessPermissionRepository>(HARNESS_TOKENS.PermissionRepository, {
    useFactory: (c) => new SQLiteHarnessPermissionRepository(db(c)),
  });
  container.register<IHarnessEvalRepository>(HARNESS_TOKENS.EvalRepository, {
    useFactory: (c) => new SQLiteHarnessEvalRepository(db(c)),
  });
  container.register<IHarnessEventLog>(HARNESS_TOKENS.EventLog, {
    useFactory: (c) =>
      new SqliteHarnessEventLog(db(c), c.resolve<IBlobStore>(HARNESS_TOKENS.BlobStore)),
  });

  // ─── Decisions, tools and policy ─────────────────────────────────────────
  container.register<IDecisionProviderFactory>(HARNESS_TOKENS.DecisionProviderFactory, {
    useFactory: () => new DecisionProviderFactory(),
  });
  container.register<IToolSource[]>(HARNESS_TOKENS.ToolSources, {
    useFactory: () => [new BuiltinToolSource()],
  });
  container.register<IToolArgumentValidator>(HARNESS_TOKENS.ToolArgumentValidator, {
    useFactory: () => new AjvToolArgumentValidator(),
  });
  container.register<IPolicyEngine>(HARNESS_TOKENS.PolicyEngine, {
    useFactory: () => new YamlPolicyEngine(),
  });
  container.register<ICommandInspector>(HARNESS_TOKENS.CommandInspector, {
    useFactory: () => new ShellCommandInspector(),
  });
  container.register<IInstructionSource>(HARNESS_TOKENS.InstructionSource, {
    useFactory: () => new FileSystemInstructionSource(),
  });

  // ─── Runtime ─────────────────────────────────────────────────────────────
  container.register<IHarnessModelProviderFactory>(HARNESS_TOKENS.ModelProviderFactory, {
    useFactory: () =>
      process.env.SHEP_MOCK_EXECUTOR === '1'
        ? { create: () => new ScriptedHarnessModelProvider([]) }
        : new HarnessModelProviderFactory(),
  });
  container.register<HarnessRuntime>(HARNESS_TOKENS.Runtime, {
    useFactory: (c) =>
      new HarnessRuntime({
        sessions: c.resolve(HARNESS_TOKENS.SessionRepository),
        context: c.resolve(HARNESS_TOKENS.ContextRepository),
        execution: c.resolve(HARNESS_TOKENS.ExecutionRepository),
        permissionRepo: c.resolve(HARNESS_TOKENS.PermissionRepository),
        events: c.resolve(HARNESS_TOKENS.EventLog),
        blobs: c.resolve(HARNESS_TOKENS.BlobStore),
        snapshotter: c.resolve(HARNESS_TOKENS.RepoSnapshotter),
        toolSources: c.resolve(HARNESS_TOKENS.ToolSources),
        validator: c.resolve(HARNESS_TOKENS.ToolArgumentValidator),
        policy: c.resolve(HARNESS_TOKENS.PolicyEngine),
        inspector: c.resolve(HARNESS_TOKENS.CommandInspector),
        instructions: c.resolve(HARNESS_TOKENS.InstructionSource),
        decisionFactory: c.resolve(HARNESS_TOKENS.DecisionProviderFactory),
        processId: process.pid,
      }),
  });
  container.register<HarnessTaskService>(HARNESS_TOKENS.TaskService, {
    useFactory: (c) =>
      new HarnessTaskService(
        c.resolve(HARNESS_TOKENS.Runtime),
        c.resolve(HARNESS_TOKENS.SessionRepository),
        c.resolve(HARNESS_TOKENS.EventLog),
        c.resolve<ISettingsRepository>('ISettingsRepository'),
        c.resolve(HARNESS_TOKENS.ModelProviderFactory)
      ),
  });

  // ─── Standalone workspaces and repository setup ──────────────────────────
  container.register<IHarnessWorkspaceService>(HARNESS_TOKENS.WorkspaceService, {
    useFactory: (c) =>
      new GitHarnessWorkspaceService(
        c.resolve<IWorktreeService>('IWorktreeService'),
        c.resolve<IWorktreePathProvider>('IWorktreePathProvider')
      ),
  });
  container.register<IHarnessProjectSetup>(HARNESS_TOKENS.ProjectSetup, {
    useFactory: () => new FileSystemHarnessProjectSetup(),
  });
  container.register<IHarnessEvalSuiteSource>(HARNESS_TOKENS.EvalSuiteSource, {
    useFactory: () => new YamlHarnessEvalSuiteSource(),
  });
  container.register<IHarnessEvalWorkspaceFactory>(HARNESS_TOKENS.EvalWorkspaceFactory, {
    useFactory: () => new TempGitEvalWorkspaceFactory(),
  });
  container.register<IHarnessEnvironmentProbe>(HARNESS_TOKENS.EnvironmentProbe, {
    useFactory: () => new HarnessEnvironmentProbe(join(getShepHomeDir(), HARNESS_OBJECTS_DIR)),
  });

  // ─── Use cases ───────────────────────────────────────────────────────────
  for (const [token, useCase] of Object.entries(HARNESS_USE_CASES)) {
    container.registerSingleton(useCase as new (...args: never[]) => unknown);
    container.register(token, {
      useFactory: (c) => c.resolve(useCase as new (...args: never[]) => unknown),
    });
  }
}
