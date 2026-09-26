/**
 * ErrorRecoveryBanner component tests
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { ErrorRecoveryBanner } from '@/components/features/chat/error-recovery-banner';

describe('ErrorRecoveryBanner', () => {
  it('offers "Try again" for a retryable failure', () => {
    const onRetry = vi.fn();
    render(
      <ErrorRecoveryBanner
        state={{ kind: 'Setup failed', message: 'Setup errored.', retryable: true }}
        onRetry={onRetry}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(onRetry).toHaveBeenCalledOnce();
    expect(screen.queryByRole('link')).toBeNull();
  });

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
  });

  it('links to the fix instead of retrying when the user must act', () => {
    render(
      <ErrorRecoveryBanner
        state={{
          kind: 'Chat unavailable for Gemini CLI',
          message: 'Gemini CLI does not support chat sessions yet.',
          retryable: false,
          action: { label: 'Open Settings', href: '/settings' },
        }}
        onRetry={vi.fn()}
      />
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Chat unavailable for Gemini CLI');
    expect(screen.getByRole('link', { name: /open settings/i })).toHaveAttribute(
      'href',
      '/settings'
    );
    expect(screen.queryByRole('button', { name: /try again/i })).toBeNull();
  });
});
