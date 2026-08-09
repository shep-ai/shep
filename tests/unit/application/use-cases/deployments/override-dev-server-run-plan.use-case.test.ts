import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  OverrideDevServerRunPlanUseCase,
  RunPlanOverrideField,
} from '@/application/use-cases/deployments/override-dev-server-run-plan.use-case.js';
import { DevServerRunPlanStatus } from '@/application/use-cases/deployments/dev-server-run-plan-results.js';
import {
  DeploymentTargetResolutionStatus,
  type DeploymentTargetResolver,
} from '@/application/services/deployment-target-resolver.js';
import type { IDevServerRunPlanRepository } from '@/application/ports/output/repositories/dev-server-run-plan-repository.interface.js';
import type { IRunPlanStalenessProbe } from '@/application/ports/output/services/run-plan-staleness-probe.interface.js';
import type { IFileSystemService } from '@/application/ports/output/services/file-system-service.interface.js';
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
    configHash: 'hash-from-before',
    installStampHash: 'install-stamp',
    createdAt: new Date('2020-01-01T00:00:00.000Z'),
    updatedAt: new Date('2020-01-01T00:00:00.000Z'),
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
    upsert: vi.fn().mockResolvedValue(undefined),
    deleteByRepoPath: vi.fn(),
    stampInstallHash: vi.fn(),
  } as unknown as IDevServerRunPlanRepository;

  const probe: IRunPlanStalenessProbe = {
    currentConfigHash: vi.fn().mockReturnValue(CURRENT_HASH),
    hasRepoDevConfig: vi.fn().mockReturnValue(false),
  };

  const fileSystem: IFileSystemService = {
    removeDirectory: vi.fn().mockResolvedValue(undefined),
    pathExists: vi.fn().mockReturnValue(true),
  };

  return { resolver, runPlanRepo, probe, fileSystem };
}

describe('OverrideDevServerRunPlanUseCase', () => {
  let deps: ReturnType<typeof createDeps>;
  let useCase: OverrideDevServerRunPlanUseCase;

  beforeEach(() => {
    deps = createDeps();
    useCase = new OverrideDevServerRunPlanUseCase(
      deps.resolver,
      deps.runPlanRepo,
      deps.probe,
      deps.fileSystem
    );
  });

  function persistedPlan(): DevServerRunPlan {
    expect(deps.runPlanRepo.upsert).toHaveBeenCalledTimes(1);
    return vi.mocked(deps.runPlanRepo.upsert).mock.calls[0][0];
  }

  it('persists the override as a Manual plan with the exact command and cwd', async () => {
    const result = await useCase.execute({
      ...APP_TARGET,
      command: 'make dev',
      cwd: `${REPO_PATH}/services/api`,
    });

    expect(persistedPlan()).toMatchObject({
      repoPath: REPO_PATH,
      source: RunPlanSource.Manual,
      command: 'make dev',
      cwd: `${REPO_PATH}/services/api`,
      configHash: CURRENT_HASH,
      installStampHash: 'install-stamp',
    });
    expect(result).toMatchObject({
      status: DevServerRunPlanStatus.Ok,
      plan: { source: RunPlanSource.Manual, command: 'make dev', isStale: false },
    });
  });

  it('resolves a repo-relative cwd against the repository root', async () => {
    await useCase.execute({ ...APP_TARGET, command: 'make dev', cwd: 'services/api' });

    expect(persistedPlan().cwd).toBe(`${REPO_PATH}/services/api`);
  });

  it('seeds unspecified fields from the currently resolved plan', async () => {
    await useCase.execute({ ...APP_TARGET, command: 'make dev' });

    expect(persistedPlan()).toMatchObject({
      command: 'make dev',
      cwd: REPO_PATH,
      packageManager: 'pnpm',
      expectedPort: 3000,
      language: 'TypeScript',
      framework: 'Next.js',
      setupCommands: ['pnpm install'],
    });
  });

  it('clears a seeded field when null is supplied explicitly', async () => {
    await useCase.execute({
      ...APP_TARGET,
      command: 'make dev',
      expectedPort: null,
      packageManager: null,
    });

    const plan = persistedPlan();
    expect(plan.expectedPort).toBeUndefined();
    expect(plan.packageManager).toBeUndefined();
  });

  it('defaults cwd to the repository root when no plan exists to seed from', async () => {
    vi.mocked(deps.runPlanRepo.findByRepoPath).mockResolvedValue(null);

    await useCase.execute({ ...APP_TARGET, command: 'go run .' });

    expect(persistedPlan()).toMatchObject({ cwd: REPO_PATH, setupCommands: [] });
  });

  describe('validation', () => {
    it('rejects an empty command', async () => {
      vi.mocked(deps.runPlanRepo.findByRepoPath).mockResolvedValue(null);

      const result = await useCase.execute({ ...APP_TARGET, command: '' });

      expect(result.status).toBe(DevServerRunPlanStatus.ValidationFailed);
      if (result.status === DevServerRunPlanStatus.ValidationFailed) {
        expect(result.errors.map((e) => e.field)).toContain(RunPlanOverrideField.Command);
      }
      expect(deps.runPlanRepo.upsert).not.toHaveBeenCalled();
    });

    it('rejects a whitespace-only command', async () => {
      const result = await useCase.execute({ ...APP_TARGET, command: '   ' });

      expect(result.status).toBe(DevServerRunPlanStatus.ValidationFailed);
      expect(deps.runPlanRepo.upsert).not.toHaveBeenCalled();
    });

    it('trims the persisted command', async () => {
      await useCase.execute({ ...APP_TARGET, command: '  make dev  ' });

      expect(persistedPlan().command).toBe('make dev');
    });

    it('rejects a cwd outside the repository subtree', async () => {
      const result = await useCase.execute({
        ...APP_TARGET,
        command: 'make dev',
        cwd: '/etc',
      });

      expect(result.status).toBe(DevServerRunPlanStatus.ValidationFailed);
      if (result.status === DevServerRunPlanStatus.ValidationFailed) {
        expect(result.errors.map((e) => e.field)).toContain(RunPlanOverrideField.Cwd);
      }
      expect(deps.runPlanRepo.upsert).not.toHaveBeenCalled();
    });

    it('rejects a sibling directory that merely shares the repository prefix', async () => {
      const result = await useCase.execute({
        ...APP_TARGET,
        command: 'make dev',
        cwd: `${REPO_PATH}-evil/src`,
      });

      expect(result.status).toBe(DevServerRunPlanStatus.ValidationFailed);
      expect(deps.runPlanRepo.upsert).not.toHaveBeenCalled();
    });

    it('rejects a cwd that escapes the repository via ..', async () => {
      const result = await useCase.execute({
        ...APP_TARGET,
        command: 'make dev',
        cwd: '../elsewhere',
      });

      expect(result.status).toBe(DevServerRunPlanStatus.ValidationFailed);
      expect(deps.runPlanRepo.upsert).not.toHaveBeenCalled();
    });

    it('rejects a cwd that does not exist', async () => {
      vi.mocked(deps.fileSystem.pathExists).mockReturnValue(false);

      const result = await useCase.execute({
        ...APP_TARGET,
        command: 'make dev',
        cwd: `${REPO_PATH}/gone`,
      });

      expect(result.status).toBe(DevServerRunPlanStatus.ValidationFailed);
      expect(deps.runPlanRepo.upsert).not.toHaveBeenCalled();
    });

    it.each([0, 65536, -1, 3000.5, Number.NaN])('rejects expectedPort %s', async (port) => {
      const result = await useCase.execute({
        ...APP_TARGET,
        command: 'make dev',
        expectedPort: port,
      });

      expect(result.status).toBe(DevServerRunPlanStatus.ValidationFailed);
      if (result.status === DevServerRunPlanStatus.ValidationFailed) {
        expect(result.errors.map((e) => e.field)).toContain(RunPlanOverrideField.ExpectedPort);
      }
      expect(deps.runPlanRepo.upsert).not.toHaveBeenCalled();
    });

    it('accepts an omitted expectedPort', async () => {
      vi.mocked(deps.runPlanRepo.findByRepoPath).mockResolvedValue(null);

      const result = await useCase.execute({ ...APP_TARGET, command: 'make dev' });

      expect(result.status).toBe(DevServerRunPlanStatus.Ok);
      expect(persistedPlan().expectedPort).toBeUndefined();
    });

    it.each([1, 65535, 8080])('accepts expectedPort %s', async (port) => {
      await useCase.execute({ ...APP_TARGET, command: 'make dev', expectedPort: port });

      expect(persistedPlan().expectedPort).toBe(port);
    });
  });

  it('refuses to write when a committed .shep/dev.json controls the repository', async () => {
    vi.mocked(deps.probe.hasRepoDevConfig).mockReturnValue(true);

    const result = await useCase.execute({ ...APP_TARGET, command: 'make dev' });

    expect(result).toMatchObject({
      status: DevServerRunPlanStatus.RepoConfigControlled,
      repoPath: REPO_PATH,
    });
    expect(deps.runPlanRepo.upsert).not.toHaveBeenCalled();
  });

  it('returns a typed target-not-found result without writing anything', async () => {
    vi.mocked(deps.resolver.resolve).mockResolvedValue({
      status: DeploymentTargetResolutionStatus.NotFound,
      targetType: DeploymentTargetType.Application,
      targetId: 'nope',
      message: 'No application found for "nope"',
    });

    const result = await useCase.execute({ ...APP_TARGET, command: 'make dev' });

    expect(result.status).toBe(DevServerRunPlanStatus.TargetNotFound);
    expect(deps.runPlanRepo.upsert).not.toHaveBeenCalled();
  });
});
