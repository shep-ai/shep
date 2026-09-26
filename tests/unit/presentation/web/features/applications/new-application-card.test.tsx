import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NewApplicationCard } from '@/components/features/applications/new-application-card';

describe('NewApplicationCard', () => {
  it('names the App Builder stack instead of a bare "Describe with AI"', () => {
    render(<NewApplicationCard onQuickWebApp={vi.fn()} />);

    const option = screen.getByRole('button', { name: /Quick web app/ });
    expect(option).toHaveTextContent('Vite + React + shadcn');
    expect(screen.queryByText('Describe with AI')).not.toBeInTheDocument();
  });

  it('offers a spec-driven, any-stack project when the caller supports it', async () => {
    const user = userEvent.setup();
    const onSpecDrivenProject = vi.fn();
    render(
      <NewApplicationCard onQuickWebApp={vi.fn()} onSpecDrivenProject={onSpecDrivenProject} />
    );

    const option = screen.getByRole('button', { name: /Spec-driven project/ });
    expect(option).toHaveTextContent('Any stack');
    await user.click(option);

    expect(onSpecDrivenProject).toHaveBeenCalledTimes(1);
  });

  it('hides the spec-driven option when it is not available (apps-only shell)', () => {
    render(<NewApplicationCard onQuickWebApp={vi.fn()} />);

    expect(screen.queryByRole('button', { name: /Spec-driven project/ })).not.toBeInTheDocument();
  });

  it('keeps the local folder and GitHub entry points', async () => {
    const user = userEvent.setup();
    const onQuickWebApp = vi.fn();
    const onOpenLocalDirectory = vi.fn();
    const onImportGitHub = vi.fn();
    render(
      <NewApplicationCard
        onQuickWebApp={onQuickWebApp}
        onOpenLocalDirectory={onOpenLocalDirectory}
        onImportGitHub={onImportGitHub}
      />
    );

    await user.click(screen.getByRole('button', { name: /Quick web app/ }));
    await user.click(screen.getByRole('button', { name: /Open local project/ }));
    await user.click(screen.getByRole('button', { name: /Import from GitHub/ }));

    expect(onQuickWebApp).toHaveBeenCalledTimes(1);
    expect(onOpenLocalDirectory).toHaveBeenCalledTimes(1);
    expect(onImportGitHub).toHaveBeenCalledTimes(1);
  });

  it('disables the local import while it is running', () => {
    render(<NewApplicationCard onQuickWebApp={vi.fn()} onOpenLocalDirectory={vi.fn()} importing />);

    expect(screen.getByRole('button', { name: /Open local project/ })).toBeDisabled();
  });
});
