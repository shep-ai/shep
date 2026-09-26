/**
 * ErrorRecoveryBanner component tests
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import { ErrorRecoveryBanner } from '@/components/features/chat/ChatTab';

describe('ErrorRecoveryBanner', () => {
  it('shows the failure detail under the explanation', () => {
    render(
      <ErrorRecoveryBanner
        state={{
          kind: 'Setup failed',
          message: 'Setup errored.',
          retryable: true,
          detail: 'cursor-agent is not logged in',
        }}
        onRetry={vi.fn()}
      />
    );

    expect(screen.getByRole('alert')).toHaveTextContent('cursor-agent is not logged in');
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
  });

  it('renders no detail block when none is known', () => {
    render(
      <ErrorRecoveryBanner
        state={{ kind: 'Setup failed', message: 'Setup errored.', retryable: false }}
      />
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Setup errored.');
    expect(screen.queryByText(/cursor-agent/)).toBeNull();
  });
});
