import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

import { DeploymentTargetType, RunPlanSource } from '@shepai/core/domain/generated/output';
import {
  DevServerRunPlanStatus,
  RunPlanOverrideField,
  REPO_CONFIG_CONTROLLED_NOTICE,
} from '@shepai/core/application/use-cases/deployments/dev-server-run-plan-vocabulary';
import { RunPlanDisclosure } from '@/components/features/application-page/run-plan/run-plan-disclosure';

const mockGet = vi.fn();
const mockOverride = vi.fn();
const mockInvalidate = vi.fn();

vi.mock('@/app/actions/get-dev-server-run-plan', () => ({
  getDevServerRunPlan: (...args: unknown[]) => mockGet(...args),
}));
vi.mock('@/app/actions/override-dev-server-run-plan', () => ({
  overrideDevServerRunPlan: (...args: unknown[]) => mockOverride(...args),
}));
vi.mock('@/app/actions/invalidate-dev-server-run-plan', () => ({
  invalidateDevServerRunPlan: (...args: unknown[]) => mockInvalidate(...args),
}));

const PLAN = {
  repoPath: '/repos/acme',
  command: 'pnpm dev',
  cwd: '/repos/acme',
  source: RunPlanSource.Deterministic,
  setupCommands: [],
  isStale: false,
};

function renderDisclosure(props: Partial<React.ComponentProps<typeof RunPlanDisclosure>> = {}) {
  return render(
    <RunPlanDisclosure targetType={DeploymentTargetType.Application} targetId="app-1" {...props} />
  );
}

describe('RunPlanDisclosure', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGet.mockResolvedValue({
      status: DevServerRunPlanStatus.Ok,
      repoPath: '/repos/acme',
      repoConfigControlled: false,
      plan: PLAN,
    });
    mockOverride.mockResolvedValue({
      status: DevServerRunPlanStatus.Ok,
      repoPath: '/repos/acme',
      plan: { ...PLAN, command: 'make dev', source: RunPlanSource.Manual },
    });
    mockInvalidate.mockResolvedValue({
      status: DevServerRunPlanStatus.Ok,
      repoPath: '/repos/acme',
      clearedSource: RunPlanSource.Deterministic,
      repoConfigControlled: false,
    });
  });

  it('is collapsed by default and does not query the plan', () => {
    renderDisclosure();

    expect(screen.queryByTestId('run-plan-body')).not.toBeInTheDocument();
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('loads and shows the plan on first expand', async () => {
    renderDisclosure();

    fireEvent.click(screen.getByTestId('run-plan-toggle'));

    expect(mockGet).toHaveBeenCalledWith({
      targetType: DeploymentTargetType.Application,
      targetId: 'app-1',
    });
    expect(await screen.findByTestId('run-plan-command')).toHaveTextContent('pnpm dev');
  });

  it('does not re-query when collapsed and expanded again', async () => {
    renderDisclosure();

    fireEvent.click(screen.getByTestId('run-plan-toggle'));
    await screen.findByTestId('run-plan-command');
    fireEvent.click(screen.getByTestId('run-plan-toggle'));
    fireEvent.click(screen.getByTestId('run-plan-toggle'));

    await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(1));
  });

  it.each([
    [DeploymentTargetType.Application, 'app-1'],
    [DeploymentTargetType.Feature, 'feat-1'],
    [DeploymentTargetType.Repository, 'repo-1'],
  ])('resolves the plan for a %s target', async (targetType, targetId) => {
    renderDisclosure({ targetType, targetId });

    fireEvent.click(screen.getByTestId('run-plan-toggle'));

    await waitFor(() => expect(mockGet).toHaveBeenCalledWith({ targetType, targetId }));
    expect(await screen.findByTestId('run-plan-command')).toBeInTheDocument();
  });

  it('saves an edit through the override action and returns to the summary', async () => {
    renderDisclosure({ defaultOpen: true });
    await screen.findByTestId('run-plan-command');

    fireEvent.click(screen.getByTestId('run-plan-edit'));
    fireEvent.change(screen.getByTestId('run-plan-command-input'), {
      target: { value: 'make dev' },
    });
    fireEvent.click(screen.getByTestId('run-plan-save'));

    await waitFor(() =>
      expect(mockOverride).toHaveBeenCalledWith(
        expect.objectContaining({
          targetType: DeploymentTargetType.Application,
          targetId: 'app-1',
          command: 'make dev',
        })
      )
    );
    expect(await screen.findByTestId('run-plan-command')).toHaveTextContent('make dev');
  });

  it('keeps the editor open and shows per-field errors when the override is rejected', async () => {
    mockOverride.mockResolvedValue({
      status: DevServerRunPlanStatus.ValidationFailed,
      errors: [
        { field: RunPlanOverrideField.Command, message: 'A dev server command is required.' },
      ],
    });
    renderDisclosure({ defaultOpen: true });
    await screen.findByTestId('run-plan-command');

    fireEvent.click(screen.getByTestId('run-plan-edit'));
    fireEvent.click(screen.getByTestId('run-plan-save'));

    expect(await screen.findByTestId('run-plan-error-command')).toBeInTheDocument();
    expect(screen.getByTestId('run-plan-editor')).toBeInTheDocument();
  });

  it('makes the editor inert when the override is refused by a committed .shep/dev.json', async () => {
    mockOverride.mockResolvedValue({
      status: DevServerRunPlanStatus.RepoConfigControlled,
      repoPath: '/repos/acme',
      message: REPO_CONFIG_CONTROLLED_NOTICE,
    });
    renderDisclosure({ defaultOpen: true });
    await screen.findByTestId('run-plan-command');

    fireEvent.click(screen.getByTestId('run-plan-edit'));
    fireEvent.click(screen.getByTestId('run-plan-save'));

    expect(await screen.findByTestId('run-plan-repo-config-notice')).toBeInTheDocument();
    expect(screen.getByTestId('run-plan-save')).toBeDisabled();
  });

  it('disables Edit outright when a committed .shep/dev.json is already in charge', async () => {
    mockGet.mockResolvedValue({
      status: DevServerRunPlanStatus.Ok,
      repoPath: '/repos/acme',
      repoConfigControlled: true,
      plan: PLAN,
    });
    renderDisclosure({ defaultOpen: true });

    expect(await screen.findByTestId('run-plan-edit')).toBeDisabled();
  });

  it('clears the plan through the invalidate action on Re-analyze', async () => {
    renderDisclosure({ defaultOpen: true });
    await screen.findByTestId('run-plan-command');

    fireEvent.click(screen.getByTestId('run-plan-reanalyze'));

    await waitFor(() =>
      expect(mockInvalidate).toHaveBeenCalledWith({
        targetType: DeploymentTargetType.Application,
        targetId: 'app-1',
      })
    );
    expect(await screen.findByTestId('run-plan-empty')).toBeInTheDocument();
  });

  it('reports a target failure instead of showing a plan it could not read', async () => {
    mockGet.mockResolvedValue({
      status: DevServerRunPlanStatus.TargetNotFound,
      message: 'No such application: app-1',
    });
    renderDisclosure({ defaultOpen: true });

    expect(await screen.findByTestId('run-plan-load-error')).toHaveTextContent(
      'No such application: app-1'
    );
    expect(screen.queryByTestId('run-plan-command')).not.toBeInTheDocument();
  });

  it('falls back to a translated message when the action itself throws', async () => {
    mockGet.mockRejectedValue(new Error('boom'));
    renderDisclosure({ defaultOpen: true });

    expect(await screen.findByTestId('run-plan-load-error')).toHaveTextContent(
      'Could not load the run plan.'
    );
  });
});
