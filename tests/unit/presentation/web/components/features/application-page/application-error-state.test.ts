/**
 * deriveApplicationErrorState unit tests
 *
 * Picks the recovery banner the application's chat shows. An agent that
 * cannot run chat sessions takes precedence over the generic "Setup failed"
 * banner: its "Try again" would re-run setup with the same agent and fail
 * again, so the banner must say why and link to Settings instead.
 */

import { describe, it, expect } from 'vitest';

import { deriveApplicationErrorState } from '@/components/features/application-page/application-error-state';
import { ApplicationStatus } from '@shepai/core/domain/generated/output';

describe('deriveApplicationErrorState', () => {
  it('returns null for a healthy application whose agent can chat', () => {
    expect(
      deriveApplicationErrorState(ApplicationStatus.Idle, {
        agentType: 'claude-code',
        label: 'Claude Code',
        supported: true,
      })
    ).toBeNull();
  });

  it('keeps the retryable "Setup failed" banner for other setup errors', () => {
    const state = deriveApplicationErrorState(ApplicationStatus.Error, { supported: true });

    expect(state).toMatchObject({ kind: 'Setup failed', retryable: true });
    expect(state?.action).toBeUndefined();
  });

  it('explains an agent without chat support and links to Settings instead of retrying', () => {
    const state = deriveApplicationErrorState(ApplicationStatus.Error, {
      agentType: 'gemini-cli',
      label: 'Gemini CLI',
      supported: false,
    });

    expect(state).toMatchObject({
      kind: 'Chat unavailable for Gemini CLI',
      retryable: false,
      action: { label: 'Open Settings', href: '/settings' },
    });
    expect(state?.message).toContain('Gemini CLI');
  });

  it('shows the agent banner even before setup has failed', () => {
    const state = deriveApplicationErrorState(ApplicationStatus.Idle, {
      agentType: 'gemini-cli',
      label: 'Gemini CLI',
      supported: false,
    });

    expect(state?.kind).toBe('Chat unavailable for Gemini CLI');
  });

  it('treats a missing capability answer as no agent problem', () => {
    expect(deriveApplicationErrorState(ApplicationStatus.Idle, undefined)).toBeNull();
  });
});
