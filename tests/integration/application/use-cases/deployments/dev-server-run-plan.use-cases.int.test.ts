/**
 * End-to-end proof for the three run-plan use cases (spec 108, phase 4).
 *
 * The unit suites pin the use cases against mocks; this one pins the thing
 * that actually matters — that a plan written by `OverrideDevServerRunPlanUseCase`
 * is the plan the real graph spawns, verbatim, in the directory the user chose,
 * and that `InvalidateDevServerRunPlanUseCase` really does put the next start
 * back on the detector chain.
 *
 * Real composition throughout (real SQLite + migrations, real DeploymentService,
 * real detector registry, real child processes). The agent seams are absent
 * entirely — `analysis: null` — so every assertion here also proves the path
 * works with no AI agent configured.
 */

import 'reflect-metadata';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { vi } from 'vitest';

import {
  createHarness,
  makeNodeFixture,
  waitForState,
  waitForLogLine,
  uniqueTargetId,
  type DevServerAgentHarness,
} from '../../../infrastructure/services/agents/dev-server-agent/harness.js';
import { GetDevServerRunPlanUseCase } from '@/application/use-cases/deployments/get-dev-server-run-plan.use-case.js';
import { OverrideDevServerRunPlanUseCase } from '@/application/use-cases/deployments/override-dev-server-run-plan.use-case.js';
import { InvalidateDevServerRunPlanUseCase } from '@/application/use-cases/deployments/invalidate-dev-server-run-plan.use-case.js';
import { DevServerRunPlanStatus } from '@/application/use-cases/deployments/dev-server-run-plan-results.js';
import { DeploymentTargetResolver } from '@/application/services/deployment-target-resolver.js';
import { RunPlanStalenessProbe } from '@/infrastructure/services/deployment/run-plan-staleness-probe.js';
import type { IApplicationRepository } from '@/application/ports/output/repositories/application-repository.interface.js';
import type { IFeatureRepository } from '@/application/ports/output/repositories/feature-repository.interface.js';
import type { IRepositoryRepository } from '@/application/ports/output/repositories/repository-repository.interface.js';
import type { IFileSystemService } from '@/application/ports/output/services/file-system-service.interface.js';
import type { IWorktreePathProvider } from '@/application/ports/output/services/worktree-path-provider.interface.js';
import { DeploymentState, DeploymentTargetType, RunPlanSource } from '@/domain/generated/output.js';
import { normalizePath } from '@/domain/shared/normalize-path.js';

/** Terminal log line the agent service emits once a run has fully completed. */
const RUN_SUCCEEDED_LINE = 'dev-server agent run succeeded';

/** Marker the overridden server writes so "which binary ran" is observable. */
const OVERRIDE_MARKER = 'override-server.ran';
const OVERRIDE_SERVER_FILE = 'override-server.js';
const OVERRIDE_SUBDIR = 'services';

/**
 * A second fixture dev server, distinguishable from the harness default: it
 * writes a marker into its OWN cwd, so both "which command ran" and "in which
 * directory" are provable from the filesystem alone.
 */
const OVERRIDE_SERVER_SOURCE = `
const net = require('node:net');
const fs = require('node:fs');
const path = require('node:path');
const server = net.createServer(() => {});
server.listen(0, () => {
  const { port } = server.address();
  fs.writeFileSync(path.join(process.cwd(), '${OVERRIDE_MARKER}'), String(process.pid));
  console.log('ready - started server on 0.0.0.0:' + port + ', url: http://localhost:' + port);
});
setInterval(() => {}, 1000);
`;

interface UseCases {
  get: GetDevServerRunPlanUseCase;
  override: OverrideDevServerRunPlanUseCase;
  invalidate: InvalidateDevServerRunPlanUseCase;
}

/**
 * Wire the use cases over the harness's REAL run-plan repository and a real
 * staleness probe. Only the entity repositories are stubbed — a bare
 * repository target is keyed by its own path, so nothing needs to be
 * registered for the resolver to answer.
 */
function buildUseCases(harness: DevServerAgentHarness): UseCases {
  const applicationRepo = {
    findById: vi.fn().mockResolvedValue(null),
    list: vi.fn().mockResolvedValue([]),
  } as unknown as IApplicationRepository;
  const featureRepo = {
    findById: vi.fn().mockResolvedValue(null),
    list: vi.fn().mockResolvedValue([]),
  } as unknown as IFeatureRepository;
  const repositoryRepo = {
    findById: vi.fn().mockResolvedValue(null),
    findByPath: vi.fn().mockResolvedValue(null),
    list: vi.fn().mockResolvedValue([]),
  } as unknown as IRepositoryRepository;
  const fileSystem: IFileSystemService = {
    removeDirectory: vi.fn().mockResolvedValue(undefined),
    pathExists: (path: string) => existsSync(path),
  };
  const worktreePaths: IWorktreePathProvider = { getWorktreePath: vi.fn() };

  const resolver = new DeploymentTargetResolver(
    applicationRepo,
    featureRepo,
    repositoryRepo,
    fileSystem,
    worktreePaths
  );
  const probe = new RunPlanStalenessProbe();

  return {
    get: new GetDevServerRunPlanUseCase(resolver, harness.runPlanRepository, probe),
    override: new OverrideDevServerRunPlanUseCase(
      resolver,
      harness.runPlanRepository,
      probe,
      fileSystem
    ),
    invalidate: new InvalidateDevServerRunPlanUseCase(resolver, harness.runPlanRepository, probe),
  };
}

describe('dev-server run-plan use cases (integration)', () => {
  let harness: DevServerAgentHarness;
  let useCases: UseCases;
  let fixture: string;
  let target: { targetType: DeploymentTargetType; targetId: string };

  beforeEach(async () => {
    // analysis: null — no structured caller at all, so every scenario below
    // also proves degraded-mode behaviour.
    harness = await createHarness({ analysis: null });
    useCases = buildUseCases(harness);
    fixture = normalizePath(harness.trackFixture(makeNodeFixture({ nodeModules: true })));
    target = { targetType: DeploymentTargetType.Repository, targetId: fixture };
  });

  afterEach(async () => {
    await harness.cleanup();
  });

  /** Write the alternate server into a subdirectory of the fixture. */
  function makeOverrideServer(): string {
    const dir = join(fixture, OVERRIDE_SUBDIR);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, OVERRIDE_SERVER_FILE), OVERRIDE_SERVER_SOURCE);
    return normalizePath(dir);
  }

  it('spawns the overridden command in the overridden cwd on the very next start', async () => {
    const overrideCwd = makeOverrideServer();

    const saved = await useCases.override.execute({
      ...target,
      command: `node ${OVERRIDE_SERVER_FILE}`,
      cwd: OVERRIDE_SUBDIR,
    });
    expect(saved.status).toBe(DevServerRunPlanStatus.Ok);

    const targetId = uniqueTargetId();
    await harness.service.startDevServer(targetId, fixture, DeploymentTargetType.Repository);
    await waitForState(harness, targetId, DeploymentState.Ready);
    // The graph run must be complete before teardown removes the fixture,
    // or a still-pending verify would remediate into a deleted directory.
    await waitForLogLine(harness, targetId, RUN_SUCCEEDED_LINE);

    // The marker proves BOTH facts: the overridden binary ran, and it ran
    // with the overridden directory as its cwd.
    expect(existsSync(join(overrideCwd, OVERRIDE_MARKER))).toBe(true);
    expect(harness.structuredCallSpy).not.toHaveBeenCalled();

    const stored = await harness.runPlanRepository.findByRepoPath(fixture);
    expect(stored).toMatchObject({
      source: RunPlanSource.Manual,
      command: `node ${OVERRIDE_SERVER_FILE}`,
      cwd: overrideCwd,
    });
  });

  it('keeps the override after the repo config files change, and reports it as stale', async () => {
    makeOverrideServer();
    await useCases.override.execute({
      ...target,
      command: `node ${OVERRIDE_SERVER_FILE}`,
      cwd: OVERRIDE_SUBDIR,
    });

    const before = await useCases.get.execute(target);
    expect(before).toMatchObject({ plan: { isStale: false } });

    // Mutate a tracked manifest — exactly the drift that invalidates a
    // Deterministic plan and must NOT touch a pinned one.
    writeFileSync(
      join(fixture, 'package.json'),
      JSON.stringify({ name: 'moved-on', scripts: { dev: 'node server.js' } })
    );

    const after = await useCases.get.execute(target);
    expect(after).toMatchObject({
      status: DevServerRunPlanStatus.Ok,
      plan: {
        source: RunPlanSource.Manual,
        command: `node ${OVERRIDE_SERVER_FILE}`,
        isStale: true,
      },
    });
  });

  it('re-runs the detector chain after invalidation, with no agent configured', async () => {
    makeOverrideServer();
    await useCases.override.execute({
      ...target,
      command: `node ${OVERRIDE_SERVER_FILE}`,
      cwd: OVERRIDE_SUBDIR,
    });

    const cleared = await useCases.invalidate.execute(target);
    expect(cleared).toMatchObject({
      status: DevServerRunPlanStatus.Ok,
      clearedSource: RunPlanSource.Manual,
    });
    expect(await harness.runPlanRepository.findByRepoPath(fixture)).toBeNull();

    const targetId = uniqueTargetId();
    await harness.service.startDevServer(targetId, fixture, DeploymentTargetType.Repository);
    await waitForState(harness, targetId, DeploymentState.Ready);
    await waitForLogLine(harness, targetId, RUN_SUCCEEDED_LINE);

    // Back on the deterministic tier: the package.json dev script, not the
    // override — and still zero agent calls.
    const rebuilt = await harness.runPlanRepository.findByRepoPath(fixture);
    expect(rebuilt).toMatchObject({ source: RunPlanSource.Deterministic });
    expect(harness.structuredCallSpy).not.toHaveBeenCalled();
  });

  it('returns an explicit no-plan result for a repository that has never been analyzed', async () => {
    const result = await useCases.get.execute(target);

    expect(result).toEqual({
      status: DevServerRunPlanStatus.NoPlan,
      repoPath: fixture,
      repoConfigControlled: false,
    });
  });

  it('refuses a database override when a committed .shep/dev.json controls the repository', async () => {
    mkdirSync(join(fixture, '.shep'), { recursive: true });
    writeFileSync(
      join(fixture, '.shep', 'dev.json'),
      JSON.stringify({ command: 'node server.js' })
    );

    const result = await useCases.override.execute({ ...target, command: 'node other.js' });

    expect(result).toMatchObject({
      status: DevServerRunPlanStatus.RepoConfigControlled,
      repoPath: fixture,
    });
    expect(await harness.runPlanRepository.findByRepoPath(fixture)).toBeNull();
  });
});
