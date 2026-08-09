import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GetDevServerRunPlanUseCase } from '@/application/use-cases/deployments/get-dev-server-run-plan.use-case.js';
import { DevServerRunPlanStatus } from '@/application/use-cases/deployments/dev-server-run-plan-results.js';
import {
  DeploymentTargetResolutionStatus,
  type DeploymentTargetResolver,
} from '@/application/services/deployment-target-resolver.js';
import type { IDevServerRunPlanRepository } from '@/application/ports/output/repositories/dev-server-run-plan-repository.interface.js';
import type { IRunPlanStalenessProbe } from '@/application/ports/output/services/run-plan-staleness-probe.interface.js';
import type { DevServerRunPlan } from '@/domain/generated/output.js';
import { DeploymentTargetType, RunPlanSource } from '@/domain/generated/output.js';

const REPO_PATH = '/workspaces/acme';
const CURRENT_HASH = 'hash-current';

const APP_TARGET = {
  targetType: DeploymentTargetType.Application,
  targetId: 'app-1',
} as const;

function buildPlan(overrides: Partial<DevServerRunPlan> = {}): DevServerRunPlan {
  return {
    repoPath: REPO_PATH,
    source: RunPlanSource.Deterministic,
    command: 'pnpm run dev',
    cwd: REPO_PATH,
    packageManager: 'pnpm',
    expectedPort: 3000,
    language: 'TypeScript',
    framework: 'Next.js',
    setupCommands: ['pnpm install'],
    configHash: CURRENT_HASH,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as DevServerRunPlan;
}

function createDeps() {
  const resolver = {
    resolve: vi.fn().mockResolvedValue({
      status: DeploymentTargetResolutionStatus.Resolved,
      target: { ...APP_TARGET, repoPath: REPO_PATH },
    }),
    resolveFromCwd: vi.fn(),
  } as unknown as DeploymentTargetResolver;

  const runPlanRepo = {
    findByRepoPath: vi.fn().mockResolvedValue(buildPlan()),
    upsert: vi.fn(),
    deleteByRepoPath: vi.fn(),
    stampInstallHash: vi.fn(),
  } as unknown as IDevServerRunPlanRepository;

  const probe: IRunPlanStalenessProbe = {
    currentConfigHash: vi.fn().mockReturnValue(CURRENT_HASH),
    hasRepoDevConfig: vi.fn().mockReturnValue(false),
  };

  return { resolver, runPlanRepo, probe };
}

describe('GetDevServerRunPlanUseCase', () => {
  let deps: ReturnType<typeof createDeps>;
  let useCase: GetDevServerRunPlanUseCase;

  beforeEach(() => {
    deps = createDeps();
    useCase = new GetDevServerRunPlanUseCase(deps.resolver, deps.runPlanRepo, deps.probe);
  });

  it('returns the fully populated plan for an application target', async () => {
    const result = await useCase.execute(APP_TARGET);

    expect(deps.runPlanRepo.findByRepoPath).toHaveBeenCalledWith(REPO_PATH);
    expect(result).toEqual({
      status: DevServerRunPlanStatus.Ok,
      repoPath: REPO_PATH,
      repoConfigControlled: false,
      plan: {
        repoPath: REPO_PATH,
        command: 'pnpm run dev',
        cwd: REPO_PATH,
        source: RunPlanSource.Deterministic,
        packageManager: 'pnpm',
        expectedPort: 3000,
        language: 'TypeScript',
        framework: 'Next.js',
        setupCommands: ['pnpm install'],
        isStale: false,
      },
    });
  });

  it.each([DeploymentTargetType.Feature, DeploymentTargetType.Repository])(
    'resolves a %s target through the shared resolver',
    async (targetType) => {
      const result = await useCase.execute({ targetType, targetId: 'target-1' });

      expect(deps.resolver.resolve).toHaveBeenCalledWith({ targetType, targetId: 'target-1' });
      expect(result.status).toBe(DevServerRunPlanStatus.Ok);
    }
  );

  it('returns an explicit no-plan result rather than throwing when nothing is cached', async () => {
    vi.mocked(deps.runPlanRepo.findByRepoPath).mockResolvedValue(null);

    const result = await useCase.execute(APP_TARGET);

    expect(result).toEqual({
      status: DevServerRunPlanStatus.NoPlan,
      repoPath: REPO_PATH,
      repoConfigControlled: false,
    });
  });

  it('marks the plan stale when the stored configHash differs from the current one', async () => {
    vi.mocked(deps.probe.currentConfigHash).mockReturnValue('hash-moved-on');

    const result = await useCase.execute(APP_TARGET);

    expect(result).toMatchObject({ plan: { isStale: true } });
  });

  it('keeps a pinned Manual plan and reports its staleness rather than replacing it', async () => {
    vi.mocked(deps.runPlanRepo.findByRepoPath).mockResolvedValue(
      buildPlan({ source: RunPlanSource.Manual, configHash: 'hash-from-before' })
    );

    const result = await useCase.execute(APP_TARGET);

    expect(result).toMatchObject({
      plan: { source: RunPlanSource.Manual, isStale: true },
    });
    expect(deps.runPlanRepo.upsert).not.toHaveBeenCalled();
    expect(deps.runPlanRepo.deleteByRepoPath).not.toHaveBeenCalled();
  });

  it('reports repoConfigControlled when a valid .shep/dev.json exists for the target', async () => {
    vi.mocked(deps.probe.hasRepoDevConfig).mockReturnValue(true);

    const result = await useCase.execute(APP_TARGET);

    expect(result).toMatchObject({ repoConfigControlled: true });
    expect(deps.probe.hasRepoDevConfig).toHaveBeenCalledWith(REPO_PATH);
  });

  it('omits optional fields the plan does not carry', async () => {
    vi.mocked(deps.runPlanRepo.findByRepoPath).mockResolvedValue(
      buildPlan({
        packageManager: undefined,
        expectedPort: undefined,
        language: undefined,
        framework: undefined,
        setupCommands: [],
      })
    );

    const result = await useCase.execute(APP_TARGET);

    expect(result).toMatchObject({
      plan: { command: 'pnpm run dev', setupCommands: [], isStale: false },
    });
    if (result.status === DevServerRunPlanStatus.Ok) {
      expect(Object.keys(result.plan)).not.toContain('packageManager');
      expect(Object.keys(result.plan)).not.toContain('expectedPort');
    }
  });

  it('returns a typed target-not-found result for an unknown target', async () => {
    vi.mocked(deps.resolver.resolve).mockResolvedValue({
      status: DeploymentTargetResolutionStatus.NotFound,
      targetType: DeploymentTargetType.Application,
      targetId: 'nope',
      message: 'No application found for "nope"',
    });

    const result = await useCase.execute({ ...APP_TARGET, targetId: 'nope' });

    expect(result.status).toBe(DevServerRunPlanStatus.TargetNotFound);
    expect(deps.runPlanRepo.findByRepoPath).not.toHaveBeenCalled();
  });

  it('returns a typed path-missing result when the target directory is gone', async () => {
    vi.mocked(deps.resolver.resolve).mockResolvedValue({
      status: DeploymentTargetResolutionStatus.PathMissing,
      target: { ...APP_TARGET, repoPath: REPO_PATH },
      message: `Directory does not exist: ${REPO_PATH}`,
    });

    const result = await useCase.execute(APP_TARGET);

    expect(result).toMatchObject({
      status: DevServerRunPlanStatus.TargetPathMissing,
      repoPath: REPO_PATH,
    });
  });
});
