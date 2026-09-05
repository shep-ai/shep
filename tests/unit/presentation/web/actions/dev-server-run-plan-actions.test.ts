// @vitest-environment node

/**
 * The three run-plan server actions are deliberately pass-through: every
 * outcome the user needs to see — a missing plan, a validation failure, a
 * repository whose `.shep/dev.json` is in charge — is already a typed result
 * from the use case. An action that flattened those into `{ success: false }`
 * would throw away the vocabulary the disclosure branches on.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

import { DeploymentTargetType, RunPlanSource } from '@shepai/core/domain/generated/output';
import {
  DevServerRunPlanStatus,
  RunPlanOverrideField,
  REPO_CONFIG_CONTROLLED_NOTICE,
} from '@shepai/core/application/use-cases/deployments/dev-server-run-plan-vocabulary';

const mockResolve = vi.fn();
vi.mock('@/lib/server-container', () => ({
  resolve: (token: string) => mockResolve(token),
}));

const { getDevServerRunPlan } = await import(
  '../../../../../src/presentation/web/app/actions/get-dev-server-run-plan.js'
);
const { overrideDevServerRunPlan } = await import(
  '../../../../../src/presentation/web/app/actions/override-dev-server-run-plan.js'
);
const { invalidateDevServerRunPlan } = await import(
  '../../../../../src/presentation/web/app/actions/invalidate-dev-server-run-plan.js'
);

const REF = { targetType: DeploymentTargetType.Application, targetId: 'app-1' };

const executors = new Map<string, ReturnType<typeof vi.fn>>();

function stub(token: string): ReturnType<typeof vi.fn> {
  const execute = vi.fn();
  executors.set(token, execute);
  return execute;
}

describe('dev-server run-plan server actions', () => {
  let getExecute: ReturnType<typeof vi.fn>;
  let overrideExecute: ReturnType<typeof vi.fn>;
  let invalidateExecute: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    executors.clear();
    getExecute = stub('GetDevServerRunPlanUseCase');
    overrideExecute = stub('OverrideDevServerRunPlanUseCase');
    invalidateExecute = stub('InvalidateDevServerRunPlanUseCase');
    mockResolve.mockImplementation((token: string) => {
      const execute = executors.get(token);
      if (!execute) throw new Error(`Unexpected token: ${token}`);
      return { execute };
    });
  });

  describe('getDevServerRunPlan', () => {
    it('resolves the use case by token and passes the target ref through', async () => {
      getExecute.mockResolvedValue({
        status: DevServerRunPlanStatus.NoPlan,
        repoPath: '/repo',
        repoConfigControlled: false,
      });

      await getDevServerRunPlan(REF);

      expect(mockResolve).toHaveBeenCalledWith('GetDevServerRunPlanUseCase');
      expect(getExecute).toHaveBeenCalledWith(REF);
    });

    it('returns the resolved plan unchanged in shape', async () => {
      const result = {
        status: DevServerRunPlanStatus.Ok,
        repoPath: '/repo',
        repoConfigControlled: false,
        plan: {
          repoPath: '/repo',
          command: 'pnpm dev',
          cwd: '/repo',
          source: RunPlanSource.Deterministic,
          setupCommands: [],
          isStale: false,
        },
      };
      getExecute.mockResolvedValue(result);

      await expect(getDevServerRunPlan(REF)).resolves.toEqual(result);
    });

    it('passes a target failure through as a typed result rather than throwing', async () => {
      getExecute.mockResolvedValue({
        status: DevServerRunPlanStatus.TargetNotFound,
        message: 'No such application: app-1',
      });

      await expect(getDevServerRunPlan(REF)).resolves.toEqual({
        status: DevServerRunPlanStatus.TargetNotFound,
        message: 'No such application: app-1',
      });
    });
  });

  describe('overrideDevServerRunPlan', () => {
    it('resolves the use case by token and passes the whole input through', async () => {
      const input = { ...REF, command: 'make dev', expectedPort: 8080 };
      overrideExecute.mockResolvedValue({ status: DevServerRunPlanStatus.Ok });

      await overrideDevServerRunPlan(input);

      expect(mockResolve).toHaveBeenCalledWith('OverrideDevServerRunPlanUseCase');
      expect(overrideExecute).toHaveBeenCalledWith(input);
    });

    it('surfaces validation errors as a typed result, not an exception', async () => {
      const failure = {
        status: DevServerRunPlanStatus.ValidationFailed,
        errors: [
          { field: RunPlanOverrideField.Command, message: 'A dev server command is required.' },
        ],
      };
      overrideExecute.mockResolvedValue(failure);

      await expect(overrideDevServerRunPlan({ ...REF, command: '  ' })).resolves.toEqual(failure);
    });

    it('surfaces the repo-config conflict as a typed result, not an exception', async () => {
      const conflict = {
        status: DevServerRunPlanStatus.RepoConfigControlled,
        repoPath: '/repo',
        message: REPO_CONFIG_CONTROLLED_NOTICE,
      };
      overrideExecute.mockResolvedValue(conflict);

      await expect(overrideDevServerRunPlan({ ...REF, command: 'make dev' })).resolves.toEqual(
        conflict
      );
    });
  });

  describe('invalidateDevServerRunPlan', () => {
    it('resolves the use case by token and passes the target ref through', async () => {
      invalidateExecute.mockResolvedValue({
        status: DevServerRunPlanStatus.Ok,
        repoPath: '/repo',
        clearedSource: RunPlanSource.Manual,
        repoConfigControlled: false,
      });

      const result = await invalidateDevServerRunPlan(REF);

      expect(mockResolve).toHaveBeenCalledWith('InvalidateDevServerRunPlanUseCase');
      expect(invalidateExecute).toHaveBeenCalledWith(REF);
      expect(result).toEqual({
        status: DevServerRunPlanStatus.Ok,
        repoPath: '/repo',
        clearedSource: RunPlanSource.Manual,
        repoConfigControlled: false,
      });
    });

    it('passes the "nothing was cached" result through unchanged', async () => {
      invalidateExecute.mockResolvedValue({
        status: DevServerRunPlanStatus.NoPlan,
        repoPath: '/repo',
        repoConfigControlled: true,
        message: REPO_CONFIG_CONTROLLED_NOTICE,
      });

      await expect(invalidateDevServerRunPlan(REF)).resolves.toEqual({
        status: DevServerRunPlanStatus.NoPlan,
        repoPath: '/repo',
        repoConfigControlled: true,
        message: REPO_CONFIG_CONTROLLED_NOTICE,
      });
    });
  });
});
