import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { RunPlanSource } from '@shepai/core/domain/generated/output';
import {
  RunPlanOverrideField,
  type DevServerRunPlanView,
} from '@shepai/core/application/use-cases/deployments/dev-server-run-plan-vocabulary';
import { RunPlanEditor } from '@/components/features/application-page/run-plan/run-plan-editor';

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

describe('RunPlanEditor', () => {
  const onSubmit = vi.fn();
  const onCancel = vi.fn();

  beforeEach(() => vi.clearAllMocks());

  function input(testId: string): HTMLInputElement {
    return screen.getByTestId(testId) as HTMLInputElement;
  }

  it('seeds every field from the currently resolved plan', () => {
    render(
      <RunPlanEditor
        plan={makePlan({
          command: 'make dev',
          cwd: '/repos/acme/services/api',
          expectedPort: 8080,
          setupCommands: ['go mod download', 'make generate'],
        })}
        onSubmit={onSubmit}
        onCancel={onCancel}
      />
    );

    expect(input('run-plan-command-input').value).toBe('make dev');
    expect(input('run-plan-cwd-input').value).toBe('/repos/acme/services/api');
    expect(input('run-plan-port-input').value).toBe('8080');
    expect((screen.getByTestId('run-plan-setup-commands-input') as HTMLTextAreaElement).value).toBe(
      'go mod download\nmake generate'
    );
  });

  it('starts from empty fields when nothing has been resolved yet', () => {
    render(<RunPlanEditor plan={null} onSubmit={onSubmit} onCancel={onCancel} />);

    expect(input('run-plan-command-input').value).toBe('');
    expect(input('run-plan-port-input').value).toBe('');
  });

  it('always shows the execution notice while editing', () => {
    render(<RunPlanEditor plan={makePlan()} onSubmit={onSubmit} onCancel={onCancel} />);

    expect(screen.getByTestId('run-plan-execution-notice')).toHaveTextContent(
      'executed on your machine'
    );
  });

  it('submits the edited values, splitting setup commands per line', () => {
    render(<RunPlanEditor plan={makePlan()} onSubmit={onSubmit} onCancel={onCancel} />);

    fireEvent.change(input('run-plan-command-input'), { target: { value: 'make dev' } });
    fireEvent.change(input('run-plan-port-input'), { target: { value: '4000' } });
    fireEvent.change(screen.getByTestId('run-plan-setup-commands-input'), {
      target: { value: 'make deps\n\n  make generate  \n' },
    });
    fireEvent.click(screen.getByTestId('run-plan-save'));

    expect(onSubmit).toHaveBeenCalledWith({
      command: 'make dev',
      cwd: '/repos/acme',
      expectedPort: 4000,
      setupCommands: ['make deps', 'make generate'],
    });
  });

  it('submits a null port when the field is cleared, so the override clears it', () => {
    render(
      <RunPlanEditor
        plan={makePlan({ expectedPort: 3000 })}
        onSubmit={onSubmit}
        onCancel={onCancel}
      />
    );

    fireEvent.change(input('run-plan-port-input'), { target: { value: '' } });
    fireEvent.click(screen.getByTestId('run-plan-save'));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ expectedPort: null }));
  });

  it('performs no validation of its own — a blank command still reaches the use case', () => {
    render(<RunPlanEditor plan={makePlan()} onSubmit={onSubmit} onCancel={onCancel} />);

    fireEvent.change(input('run-plan-command-input'), { target: { value: '   ' } });
    fireEvent.click(screen.getByTestId('run-plan-save'));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ command: '   ' }));
    expect(screen.queryByTestId('run-plan-error-command')).not.toBeInTheDocument();
  });

  it('renders server-side validation errors inline against their field', () => {
    render(
      <RunPlanEditor
        plan={makePlan()}
        errors={[
          { field: RunPlanOverrideField.Command, message: 'A dev server command is required.' },
          {
            field: RunPlanOverrideField.ExpectedPort,
            message: 'The expected port must be a whole number between 1 and 65535.',
          },
        ]}
        onSubmit={onSubmit}
        onCancel={onCancel}
      />
    );

    expect(screen.getByTestId('run-plan-error-command')).toHaveTextContent(
      'A dev server command is required.'
    );
    expect(screen.getByTestId('run-plan-error-expectedPort')).toHaveTextContent('1 and 65535');
    expect(screen.queryByTestId('run-plan-error-cwd')).not.toBeInTheDocument();
  });

  it('renders a general failure message when the save could not be attempted', () => {
    render(
      <RunPlanEditor
        plan={makePlan()}
        errorMessage="Could not save the run plan."
        onSubmit={onSubmit}
        onCancel={onCancel}
      />
    );

    expect(screen.getByTestId('run-plan-editor-error')).toHaveTextContent(
      'Could not save the run plan.'
    );
  });

  it('disables the form and explains why when a committed .shep/dev.json is in charge', () => {
    render(
      <RunPlanEditor
        plan={makePlan()}
        repoConfigControlled
        onSubmit={onSubmit}
        onCancel={onCancel}
      />
    );

    expect(screen.getByTestId('run-plan-repo-config-notice')).toHaveTextContent('.shep/dev.json');
    expect(input('run-plan-command-input')).toBeDisabled();
    expect(screen.getByTestId('run-plan-save')).toBeDisabled();

    fireEvent.click(screen.getByTestId('run-plan-save'));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('disables saving while a submission is in flight', () => {
    render(<RunPlanEditor plan={makePlan()} submitting onSubmit={onSubmit} onCancel={onCancel} />);

    expect(screen.getByTestId('run-plan-save')).toBeDisabled();
  });

  it('cancels without submitting', () => {
    render(<RunPlanEditor plan={makePlan()} onSubmit={onSubmit} onCancel={onCancel} />);

    fireEvent.click(screen.getByTestId('run-plan-cancel'));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
