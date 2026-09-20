import { describe, it, expect } from 'vitest';

import { describeSubprocessFailure } from '@/infrastructure/services/agents/common/executors/subprocess-failure-message.js';

/**
 * Regression cover for the failure that made a Shep E2E run unreadable.
 *
 * The Claude Code CLI exited 1 because the organization had disabled Claude
 * subscription access. It said so on stdout, as the text of its final result
 * event. stderr held only an unrelated workspace-trust warning — the kind of
 * notice the CLI prints on perfectly healthy runs. The executor rejected with
 * stderr, so the worker reported the trust warning as the cause and the real
 * authentication failure never surfaced anywhere.
 */
describe('describeSubprocessFailure', () => {
  const AUTH_FAILURE =
    'Your organization has disabled Claude subscription access for Claude Code · ' +
    'Use an Anthropic API key instead, or ask your admin to enable access';
  const TRUST_WARNING =
    'Ignoring 15 permissions.allow entries from .claude/settings.local.json: ' +
    'this workspace has not been trusted.';

  it("leads with the CLI's own reason rather than an incidental stderr warning", () => {
    const message = describeSubprocessFailure({
      code: 1,
      resultText: AUTH_FAILURE,
      stderr: TRUST_WARNING,
    });

    expect(message).toContain(AUTH_FAILURE);
    expect(message.indexOf(AUTH_FAILURE)).toBeLessThan(message.indexOf(TRUST_WARNING));
  });

  it('keeps stderr as secondary detail so diagnostics are not lost', () => {
    const message = describeSubprocessFailure({
      code: 1,
      resultText: AUTH_FAILURE,
      stderr: TRUST_WARNING,
    });

    expect(message).toContain(TRUST_WARNING);
  });

  it('falls back to stderr when the CLI reported no result text', () => {
    const message = describeSubprocessFailure({ code: 2, resultText: '', stderr: TRUST_WARNING });

    expect(message).toContain(TRUST_WARNING);
    expect(message).toContain('2');
  });

  it('falls back to the exit code alone when the process said nothing', () => {
    expect(describeSubprocessFailure({ code: 137 })).toBe('Process exited with code 137');
  });

  it('always names the exit code', () => {
    expect(describeSubprocessFailure({ code: 1, resultText: AUTH_FAILURE })).toContain(
      'Process exited with code 1'
    );
  });

  it('does not repeat stderr that the result text already contains', () => {
    const resultText = `failed: ${TRUST_WARNING}`;
    const message = describeSubprocessFailure({ code: 1, resultText, stderr: TRUST_WARNING });

    expect(message.split(TRUST_WARNING)).toHaveLength(2);
  });

  it('ignores whitespace-only streams', () => {
    expect(describeSubprocessFailure({ code: 1, resultText: '  \n ', stderr: '\n\n' })).toBe(
      'Process exited with code 1'
    );
  });

  it('truncates runaway output so the message stays readable', () => {
    const flood = 'x'.repeat(10_000);
    const message = describeSubprocessFailure({ code: 1, resultText: flood });

    expect(message.length).toBeLessThan(flood.length);
    expect(message).toContain('truncated');
  });
});
