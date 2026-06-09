import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { WorkflowSettingsSection } from '@/components/features/settings/workflow-settings-section';

const mockUpdateSettingsAction = vi.fn();

vi.mock('@/app/actions/update-settings', () => ({
  updateSettingsAction: (...args: unknown[]) => mockUpdateSettingsAction(...args),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const defaultWorkflow = {
  openPrOnImplementationComplete: false,
  approvalGateDefaults: {
    allowPrd: false,
    allowPlan: false,
    allowMerge: false,
    pushOnImplementationComplete: false,
  },
  enableEvidence: false,
  commitEvidence: false,
  ciWatchEnabled: true,
  hideCiStatus: false,
  defaultMode: 'Fast',
};

describe('WorkflowSettingsSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdateSettingsAction.mockResolvedValue({ success: true });
  });

  it('renders all 5 Switch toggles', () => {
    render(<WorkflowSettingsSection workflow={defaultWorkflow} />);
    expect(screen.getByTestId('switch-open-pr')).toBeDefined();
    expect(screen.getByTestId('switch-push-on-complete')).toBeDefined();
    expect(screen.getByTestId('switch-allow-prd')).toBeDefined();
    expect(screen.getByTestId('switch-allow-plan')).toBeDefined();
    expect(screen.getByTestId('switch-allow-merge')).toBeDefined();
  });

  it('renders CI numeric inputs', () => {
    render(<WorkflowSettingsSection workflow={defaultWorkflow} />);
    expect(screen.getByTestId('ci-max-fix-input')).toBeDefined();
    expect(screen.getByTestId('ci-timeout-input')).toBeDefined();
    expect(screen.getByTestId('ci-log-max-input')).toBeDefined();
  });

  it('renders per-stage timeout inputs for feature agent', () => {
    render(<WorkflowSettingsSection workflow={defaultWorkflow} />);
    expect(screen.getByTestId('stage-timeout-analyzeTimeout-input')).toBeDefined();
    expect(screen.getByTestId('stage-timeout-requirementsTimeout-input')).toBeDefined();
    expect(screen.getByTestId('stage-timeout-researchTimeout-input')).toBeDefined();
    expect(screen.getByTestId('stage-timeout-planTimeout-input')).toBeDefined();
    expect(screen.getByTestId('stage-timeout-implementTimeout-input')).toBeDefined();
    expect(screen.getByTestId('stage-timeout-fastImplementTimeout-input')).toBeDefined();
    expect(screen.getByTestId('stage-timeout-mergeTimeout-input')).toBeDefined();
  });

  it('renders analyze-repo agent timeout input', () => {
    render(<WorkflowSettingsSection workflow={defaultWorkflow} />);
    expect(screen.getByTestId('stage-timeout-analyzeRepoTimeout-input')).toBeDefined();
  });

  it('does not render a save button (auto-saves on change)', () => {
    render(<WorkflowSettingsSection workflow={defaultWorkflow} />);
    expect(screen.queryByRole('button', { name: /save/i })).toBeNull();
  });

  it('renders title and description', () => {
    render(<WorkflowSettingsSection workflow={defaultWorkflow} />);
    expect(screen.getByText('Workflow')).toBeDefined();
    expect(
      screen.getByText('Configure PR behavior, approval gates, and CI settings')
    ).toBeDefined();
  });

  it('renders switch descriptions', () => {
    render(<WorkflowSettingsSection workflow={defaultWorkflow} />);
    expect(
      screen.getByText('Automatically create a pull request when the agent finishes')
    ).toBeDefined();
    expect(screen.getByText('Push the branch to remote when implementation is done')).toBeDefined();
  });

  it('renders ci timeout label in seconds', () => {
    render(<WorkflowSettingsSection workflow={defaultWorkflow} />);
    expect(screen.getByText('Watch timeout (seconds)')).toBeDefined();
  });

  it('renders stage timeout section headers', () => {
    render(<WorkflowSettingsSection workflow={defaultWorkflow} />);
    expect(screen.getByText('Stage Timeouts')).toBeDefined();
    expect(screen.getByText('Feature Agent')).toBeDefined();
    expect(screen.getByText('Analyze Repository Agent')).toBeDefined();
  });

  it('renders approval gates section heading', () => {
    render(<WorkflowSettingsSection workflow={defaultWorkflow} />);
    expect(screen.getByText('Approval Gates')).toBeDefined();
    expect(screen.getByText('CI Settings')).toBeDefined();
  });

  it('renders hide ci status switch', () => {
    render(<WorkflowSettingsSection workflow={defaultWorkflow} />);
    expect(screen.getByTestId('hide-ci-status-switch')).toBeDefined();
  });

  it('hide ci status switch is unchecked when hideCiStatus is false', () => {
    render(<WorkflowSettingsSection workflow={defaultWorkflow} />);
    const switchElement = screen.getByTestId('hide-ci-status-switch');
    expect(switchElement.getAttribute('data-state')).toBe('unchecked');
  });

  it('hide ci status switch is checked when hideCiStatus is true', () => {
    const workflowWithHidden = { ...defaultWorkflow, hideCiStatus: true };
    render(<WorkflowSettingsSection workflow={workflowWithHidden} />);
    const switchElement = screen.getByTestId('hide-ci-status-switch');
    expect(switchElement.getAttribute('data-state')).toBe('checked');
  });

  it('toggling hide ci status switch calls updateSettingsAction with hideCiStatus: true', async () => {
    render(<WorkflowSettingsSection workflow={defaultWorkflow} />);
    const switchElement = screen.getByTestId('hide-ci-status-switch');

    fireEvent.click(switchElement);

    // Wait for async action
    await vi.waitFor(() => {
      expect(mockUpdateSettingsAction).toHaveBeenCalledWith(
        expect.objectContaining({
          workflow: expect.objectContaining({
            hideCiStatus: true,
          }),
        })
      );
    });
  });

  it('toggling hide ci status switch off calls updateSettingsAction with hideCiStatus: false', async () => {
    const workflowWithHidden = { ...defaultWorkflow, hideCiStatus: true };
    render(<WorkflowSettingsSection workflow={workflowWithHidden} />);
    const switchElement = screen.getByTestId('hide-ci-status-switch');

    fireEvent.click(switchElement);

    // Wait for async action
    await vi.waitFor(() => {
      expect(mockUpdateSettingsAction).toHaveBeenCalledWith(
        expect.objectContaining({
          workflow: expect.objectContaining({
            hideCiStatus: false,
          }),
        })
      );
    });
  });
});
