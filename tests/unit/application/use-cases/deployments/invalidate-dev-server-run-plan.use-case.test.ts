import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { InvalidateDevServerRunPlanUseCase } from '@/application/use-cases/deployments/invalidate-dev-server-run-plan.use-case.js';
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

const APP_TARGET = {
  targetType: DeploymentTargetType.Application,
  targetId: 'app-1',
} as const;

function buildPlan(source: RunPlanSource): DevServerRunPlan {
  return {
    repoPath: REPO_PATH,
    source,
    command: 'pnpm run dev',
    cwd: REPO_PATH,
    setupCommands: [],
    configHash: 'hash',
    createdAt: new Date(),
    updatedAt: new Date(),
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
    findByRepoPath: vi.fn().mockResolvedValue(buildPlan(RunPlanSource.Deterministic)),
    upsert: vi.fn(),
    deleteByRepoPath: vi.fn().mockResolvedValue(undefined),
    stampInstallHash: vi.fn(),
  } as unknown as IDevServerRunPlanRepository;

  const probe: IRunPlanStalenessProbe = {
    currentConfigHash: vi.fn().mockReturnValue('hash'),
    hasRepoDevConfig: vi.fn().mockReturnValue(false),
  };

  return { resolver, runPlanRepo, probe };
}

describe('InvalidateDevServerRunPlanUseCase', () => {
  let deps: ReturnType<typeof createDeps>;
  let useCase: InvalidateDevServerRunPlanUseCase;

  beforeEach(() => {
    deps = createDeps();
    useCase = new InvalidateDevServerRunPlanUseCase(deps.resolver, deps.runPlanRepo, deps.probe);
  });

  it.each([RunPlanSource.Deterministic, RunPlanSource.Agent, RunPlanSource.Manual])(
    'clears a %s plan',
    async (source) => {
      vi.mocked(deps.runPlanRepo.findByRepoPath).mockResolvedValue(buildPlan(source));

      const result = await useCase.execute(APP_TARGET);

      expect(deps.runPlanRepo.deleteByRepoPath).toHaveBeenCalledWith(REPO_PATH);
      expect(result).toEqual({
        status: DevServerRunPlanStatus.Ok,
        repoPath: REPO_PATH,
        clearedSource: source,
        repoConfigControlled: false,
      });
    }
  );

  it('returns a typed no-op result when no plan exists rather than throwing', async () => {
    vi.mocked(deps.runPlanRepo.findByRepoPath).mockResolvedValue(null);

    const result = await useCase.execute(APP_TARGET);

    expect(result).toEqual({
      status: DevServerRunPlanStatus.NoPlan,
      repoPath: REPO_PATH,
      repoConfigControlled: false,
    });
    expect(deps.runPlanRepo.deleteByRepoPath).not.toHaveBeenCalled();
  });

  it('never depends on an agent being configured — nothing but the repository is touched', async () => {
    await useCase.execute(APP_TARGET);

    expect(deps.runPlanRepo.deleteByRepoPath).toHaveBeenCalledTimes(1);
    expect(deps.runPlanRepo.upsert).not.toHaveBeenCalled();
  });

  it('leaves a committed .shep/dev.json in place and explains that it still controls the repo', async () => {
    vi.mocked(deps.probe.hasRepoDevConfig).mockReturnValue(true);

    const result = await useCase.execute(APP_TARGET);

    expect(result).toMatchObject({
      status: DevServerRunPlanStatus.Ok,
      repoConfigControlled: true,
      message: expect.stringContaining('.shep/dev.json'),
    });
    expect(deps.runPlanRepo.deleteByRepoPath).toHaveBeenCalledWith(REPO_PATH);
  });

  it('returns a typed target-not-found result without deleting anything', async () => {
    vi.mocked(deps.resolver.resolve).mockResolvedValue({
      status: DeploymentTargetResolutionStatus.NotFound,
      targetType: DeploymentTargetType.Application,
      targetId: 'nope',
      message: 'No application found for "nope"',
    });

    const result = await useCase.execute({ ...APP_TARGET, targetId: 'nope' });

    expect(result.status).toBe(DevServerRunPlanStatus.TargetNotFound);
    expect(deps.runPlanRepo.deleteByRepoPath).not.toHaveBeenCalled();
  });
});
