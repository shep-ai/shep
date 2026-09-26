/**
 * Accessibility regressions for the control-center empty state (the composer).
 *
 * Covers two defects:
 *
 * P0-2 (WCAG 2.1.1 / 2.1.2) — a `window` keydown listener swallowed EVERY
 * Shift+Tab on the document and repurposed it to cycle the build mode, so
 * backward keyboard navigation was impossible anywhere on the page. Build-mode
 * cycling now lives on an explicit chord (Alt+Shift+M) scoped to the composer
 * subtree, and the resulting mode is announced to assistive tech.
 *
 * A6 — the icon-only send button had no accessible name, the textarea had only
 * a placeholder, and the submit error was neither announced nor linked to the
 * field.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TooltipProvider } from '@/components/ui/tooltip';

vi.mock('@/app/actions/get-all-agent-models', () => ({
  getAllAgentModels: vi.fn(() =>
    Promise.resolve([
      {
        agentType: 'claude-code',
        label: 'Claude Code',
        models: [{ id: 'opus-4', displayName: 'Opus 4', description: 'Best' }],
      },
    ])
  ),
}));

vi.mock('@/app/actions/update-agent-and-model', () => ({
  updateAgentAndModel: vi.fn(() => Promise.resolve({ ok: true })),
}));

vi.mock('@/app/actions/check-all-agents-status', () => ({
  checkAllAgentsStatus: vi.fn(() => Promise.resolve({ 'claude-code': true, dev: true })),
}));

vi.mock('@/app/actions/get-default-agent-and-model', () => ({
  getDefaultAgentAndModel: vi.fn(() =>
    Promise.resolve({ agentType: 'claude-code', model: 'opus-4' })
  ),
}));

vi.mock('@/components/common/feature-node/agent-type-icons', () => ({
  getAgentTypeIcon: () => {
    function MockIcon(props: Record<string, unknown>) {
      return <span data-testid="agent-icon" {...props} />;
    }
    return MockIcon;
  },
}));

vi.mock('@/lib/model-metadata', () => ({
  getModelMeta: (id: string) => ({
    displayName: id,
    description: `Description for ${id}`,
  }),
}));

vi.mock('next/image', () => ({
  default: function MockImage(props: Record<string, unknown>) {
    return <img {...props} />;
  },
}));

vi.mock('@/app/actions/create-project-and-feature', () => ({
  createProjectAndFeature: vi.fn(() => Promise.resolve({ error: 'Not available in test' })),
}));

vi.mock('@/app/actions/create-application', () => ({
  createApplication: vi.fn(() => Promise.resolve({ application: { id: 'app-123' } })),
}));

import { createApplication } from '@/app/actions/create-application';
import { ControlCenterEmptyState } from '@/components/features/control-center/control-center-empty-state';

const mockedCreateApplication = vi.mocked(createApplication);

function Wrapper({ children }: { children: React.ReactNode }) {
  return <TooltipProvider>{children}</TooltipProvider>;
}

/** The documented build-mode chord: Alt+Shift+M. */
const MODE_CHORD = '{Alt>}{Shift>}m{/Shift}{/Alt}';

describe('ControlCenterEmptyState — keyboard trap (P0-2)', () => {
  beforeEach(() => {
    mockedCreateApplication.mockClear();
    mockedCreateApplication.mockResolvedValue({
      application: { id: 'app-123' } as never,
    });
  });

  it('does not preventDefault Shift+Tab anywhere on the document', () => {
    render(<ControlCenterEmptyState onRepositorySelect={vi.fn()} />, { wrapper: Wrapper });

    const event = new KeyboardEvent('keydown', {
      key: 'Tab',
      code: 'Tab',
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    });
    window.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
  });

  it('does not change the build mode on Shift+Tab', async () => {
    const user = userEvent.setup();
    render(<ControlCenterEmptyState onRepositorySelect={vi.fn()} />, { wrapper: Wrapper });

    expect(screen.getByTestId('build-mode-selector')).toHaveTextContent('Spec-driven');

    await user.tab({ shift: true });
    await user.tab({ shift: true });

    expect(screen.getByTestId('build-mode-selector')).toHaveTextContent('Spec-driven');
  });

  it('cycles the build mode with Alt+Shift+M while the composer has focus', async () => {
    const user = userEvent.setup();
    render(<ControlCenterEmptyState onRepositorySelect={vi.fn()} />, { wrapper: Wrapper });

    const textarea = screen.getByRole('textbox');
    textarea.focus();

    await user.keyboard(MODE_CHORD);
    expect(screen.getByTestId('build-mode-selector')).toHaveTextContent('Fast');

    await user.keyboard(MODE_CHORD);
    expect(screen.getByTestId('build-mode-selector')).toHaveTextContent('Quick prototype');

    await user.keyboard(MODE_CHORD);
    expect(screen.getByTestId('build-mode-selector')).toHaveTextContent('Spec-driven');
  });

  it('ignores the chord when focus is outside the composer subtree', async () => {
    const user = userEvent.setup();
    render(<ControlCenterEmptyState onRepositorySelect={vi.fn()} />, { wrapper: Wrapper });

    (document.activeElement as HTMLElement | null)?.blur();
    expect(screen.getByTestId('control-center-empty-state')).not.toContainElement(
      document.activeElement as HTMLElement
    );

    await user.keyboard(MODE_CHORD);

    expect(screen.getByTestId('build-mode-selector')).toHaveTextContent('Spec-driven');
  });

  it('announces the new build mode in a live region', async () => {
    const user = userEvent.setup();
    render(<ControlCenterEmptyState onRepositorySelect={vi.fn()} />, { wrapper: Wrapper });

    screen.getByRole('textbox').focus();
    await user.keyboard(MODE_CHORD);

    const status = screen.getByRole('status');
    expect(status).toHaveTextContent(/Fast/);
    expect(status).toHaveAttribute('aria-live', 'polite');
  });

  it('announces the mode picked from the dropdown', async () => {
    const user = userEvent.setup();
    render(<ControlCenterEmptyState onRepositorySelect={vi.fn()} />, { wrapper: Wrapper });

    await user.click(screen.getByTestId('build-mode-selector'));
    await user.click(screen.getByTestId('build-mode-application'));

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(/Quick prototype/);
    });
  });

  it('surfaces the chord on the build-mode control so it is discoverable', () => {
    render(<ControlCenterEmptyState onRepositorySelect={vi.fn()} />, { wrapper: Wrapper });

    const selector = screen.getByTestId('build-mode-selector');
    expect(selector.getAttribute('title')).toMatch(/Alt\+Shift\+M|⌥⇧M/);
    expect(selector.getAttribute('aria-label')).toMatch(/Alt\+Shift\+M|⌥⇧M/);
  });
});

describe('ControlCenterEmptyState — labels and error wiring (A6)', () => {
  beforeEach(() => {
    mockedCreateApplication.mockClear();
    mockedCreateApplication.mockResolvedValue({
      application: { id: 'app-123' } as never,
    });
  });

  it('gives the icon-only send button an accessible name', () => {
    render(<ControlCenterEmptyState />, { wrapper: Wrapper });

    expect(screen.getByRole('button', { name: /send/i })).toBeInTheDocument();
  });

  it('gives the prompt textarea an accessible name', () => {
    render(<ControlCenterEmptyState />, { wrapper: Wrapper });

    const textarea = screen.getByRole('textbox');
    expect(textarea).toHaveAccessibleName();
  });

  it('leaves the textarea valid and undescribed while there is no error', () => {
    render(<ControlCenterEmptyState />, { wrapper: Wrapper });

    const textarea = screen.getByRole('textbox');
    expect(textarea).not.toHaveAttribute('aria-invalid', 'true');
    expect(textarea).not.toHaveAttribute('aria-describedby');
  });

  it('announces the submit error and links it to the textarea', async () => {
    const user = userEvent.setup();
    mockedCreateApplication.mockResolvedValue({ error: 'Creation failed' } as never);

    render(<ControlCenterEmptyState />, { wrapper: Wrapper });

    const textarea = screen.getByRole('textbox');
    await user.type(textarea, 'A landing page');
    await user.keyboard('{Control>}{Enter}{/Control}');

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Creation failed');

    expect(textarea).toHaveAttribute('aria-invalid', 'true');
    expect(textarea).toHaveAttribute('aria-describedby', alert.id);
    expect(alert.id).not.toBe('');
  });
});
