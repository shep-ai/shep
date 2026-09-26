import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NewApplicationCard } from '@/components/features/applications/new-application-card';

describe('NewApplicationCard', () => {
  it('offers "Plan it first" on any stack as the first way to start an app', async () => {
    const user = userEvent.setup();
    const onPlanFirst = vi.fn();
    render(<NewApplicationCard onPlanFirst={onPlanFirst} onQuickPrototype={vi.fn()} />);

    const buttons = screen.getAllByRole('button');
    expect(buttons[0]).toHaveAccessibleName(/Plan it first/);
    expect(buttons[0]).toHaveTextContent('Any stack');
    await user.click(buttons[0]);

    expect(onPlanFirst).toHaveBeenCalledTimes(1);
  });

  it('names the stack of the quick prototype starter', async () => {
    const user = userEvent.setup();
    const onQuickPrototype = vi.fn();
    render(<NewApplicationCard onQuickPrototype={onQuickPrototype} />);

    const option = screen.getByRole('button', { name: /Quick prototype/ });
    expect(option).toHaveTextContent('Vite + React + shadcn');
    await user.click(option);

    expect(onQuickPrototype).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Describe with AI')).not.toBeInTheDocument();
  });

  it('hides "Plan it first" where features cannot be started (apps-only shell)', () => {
    render(<NewApplicationCard onQuickPrototype={vi.fn()} />);

    expect(screen.queryByRole('button', { name: /Plan it first/ })).not.toBeInTheDocument();
  });

  it('keeps the local folder and GitHub entry points', async () => {
    const user = userEvent.setup();
    const onOpenLocalDirectory = vi.fn();
    const onImportGitHub = vi.fn();
    render(
      <NewApplicationCard
        onQuickPrototype={vi.fn()}
        onOpenLocalDirectory={onOpenLocalDirectory}
        onImportGitHub={onImportGitHub}
      />
    );

    await user.click(screen.getByRole('button', { name: /Open local project/ }));
    await user.click(screen.getByRole('button', { name: /Import from GitHub/ }));

    expect(onOpenLocalDirectory).toHaveBeenCalledTimes(1);
    expect(onImportGitHub).toHaveBeenCalledTimes(1);
  });

  it('disables the local import while it is running', () => {
    render(
      <NewApplicationCard onQuickPrototype={vi.fn()} onOpenLocalDirectory={vi.fn()} importing />
    );

    expect(screen.getByRole('button', { name: /Open local project/ })).toBeDisabled();
  });
});
