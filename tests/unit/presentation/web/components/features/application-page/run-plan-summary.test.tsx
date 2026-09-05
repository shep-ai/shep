import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

import { RunPlanSource } from '@shepai/core/domain/generated/output';
import type { DevServerRunPlanView } from '@shepai/core/application/use-cases/deployments/dev-server-run-plan-vocabulary';
import { RunPlanSummary } from '@/components/features/application-page/run-plan/run-plan-summary';

function makePlan(overrides: Partial<DevServerRunPlanView> = {}): DevServerRunPlanView {
  return {
    repoPath: '/repos/acme',
    command: 'pnpm dev',
    cwd: '/repos/acme',
    source: RunPlanSource.Deterministic,
    setupCommands: [],
    isStale: false,
    ...overrides,
  };
}

describe('RunPlanSummary', () => {
  it('renders the command and working directory of the resolved plan', () => {
    render(<RunPlanSummary plan={makePlan()} />);

    expect(screen.getByTestId('run-plan-command')).toHaveTextContent('pnpm dev');
    expect(screen.getByTestId('run-plan-cwd')).toHaveTextContent('/repos/acme');
  });

  it('renders every optional field when the plan carries it', () => {
    render(
      <RunPlanSummary
        plan={makePlan({
          language: 'Go',
          framework: 'Echo',
          expectedPort: 8080,
          packageManager: 'pnpm',
          setupCommands: ['go mod download'],
        })}
      />
    );

    expect(screen.getByTestId('run-plan-language')).toHaveTextContent('Go');
    expect(screen.getByTestId('run-plan-framework')).toHaveTextContent('Echo');
    expect(screen.getByTestId('run-plan-expected-port')).toHaveTextContent('8080');
    expect(screen.getByTestId('run-plan-package-manager')).toHaveTextContent('pnpm');
    expect(screen.getByTestId('run-plan-setup-commands')).toHaveTextContent('go mod download');
  });

  it('omits rows for absent optional values rather than rendering blanks', () => {
    render(<RunPlanSummary plan={makePlan()} />);

    expect(screen.queryByTestId('run-plan-language')).not.toBeInTheDocument();
    expect(screen.queryByTestId('run-plan-framework')).not.toBeInTheDocument();
    expect(screen.queryByTestId('run-plan-expected-port')).not.toBeInTheDocument();
    expect(screen.queryByTestId('run-plan-package-manager')).not.toBeInTheDocument();
    expect(screen.queryByTestId('run-plan-setup-commands')).not.toBeInTheDocument();
  });

  it('renders a port of zero rather than treating it as absent', () => {
    // Guards against a truthiness check standing in for a presence check.
    render(<RunPlanSummary plan={makePlan({ expectedPort: 0 })} />);

    expect(screen.getByTestId('run-plan-expected-port')).toHaveTextContent('0');
  });

  it.each([
    [RunPlanSource.Deterministic, 'Detected'],
    [RunPlanSource.Agent, 'AI-analyzed'],
    [RunPlanSource.Manual, 'Pinned'],
  ])('badges a %s plan distinctly', (source, label) => {
    render(<RunPlanSummary plan={makePlan({ source })} />);

    const badge = screen.getByTestId('run-plan-source-badge');
    expect(badge).toHaveTextContent(label);
    expect(badge).toHaveAttribute('data-source', source);
  });

  it('renders the staleness hint only when the plan is stale', () => {
    const { rerender } = render(<RunPlanSummary plan={makePlan({ isStale: false })} />);
    expect(screen.queryByTestId('run-plan-stale-hint')).not.toBeInTheDocument();

    rerender(<RunPlanSummary plan={makePlan({ isStale: true })} />);
    expect(screen.getByTestId('run-plan-stale-hint')).toBeInTheDocument();
  });

  it('explains that a committed .shep/dev.json is in charge when it is', () => {
    render(<RunPlanSummary plan={makePlan()} repoConfigControlled />);

    expect(screen.getByTestId('run-plan-repo-config-notice')).toHaveTextContent('.shep/dev.json');
  });

  it('renders an empty state instead of a table when no plan is cached', () => {
    render(<RunPlanSummary plan={null} />);

    expect(screen.getByTestId('run-plan-empty')).toBeInTheDocument();
    expect(screen.queryByTestId('run-plan-command')).not.toBeInTheDocument();
  });

  it('uses translated labels rather than hardcoded English', () => {
    render(<RunPlanSummary plan={makePlan()} />);

    // Resolved through i18n — a missing key would surface as the raw key path.
    expect(screen.getByText('Command')).toBeInTheDocument();
    expect(screen.queryByText('runPlan.fields.command')).not.toBeInTheDocument();
  });
});
