import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ExistingCodeHint } from '@/components/features/control-center/existing-code-hint';

describe('ExistingCodeHint', () => {
  it('names the referenced folder and explains a new project starts empty', () => {
    render(<ExistingCodeHint path="/home/alex/code/app" />);

    const hint = screen.getByTestId('existing-code-hint');
    expect(hint).toHaveTextContent('/home/alex/code/app');
    expect(hint).toHaveTextContent(/starts empty/i);
  });

  it('offers a hand-off when the caller can open the folder', async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    render(<ExistingCodeHint path="/home/alex/code/app" onOpen={onOpen} />);

    await user.click(screen.getByRole('button', { name: /work on this folder/i }));

    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('falls back to guidance when no hand-off is available', () => {
    render(<ExistingCodeHint path="~/code/app" />);

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByTestId('existing-code-hint')).toHaveTextContent(/open that folder/i);
  });
});
