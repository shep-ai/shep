/**
 * `shep settings worktree` Unit Tests
 *
 * Covers how CLI flags map onto WorktreeConfig — read-only invocation,
 * clearing individual commands, `--clear`, and timeout validation.
 */

import 'reflect-metadata';
import { describe, it, expect } from 'vitest';
import { buildNextConfig } from '@/presentation/cli/commands/settings/worktree.command.js';

const EXISTING = {
  createCommand: 'my-tool create',
  postCreateCommand: 'pnpm install',
  commandTimeoutMs: 60000,
};

describe('buildNextConfig', () => {
  it('returns null when no option is supplied (read-only invocation)', () => {
    expect(buildNextConfig(EXISTING, {})).toBeNull();
  });

  it('sets the post-create command without touching the others', () => {
    expect(buildNextConfig(EXISTING, { postCreateCommand: 'make bootstrap' })).toEqual({
      ...EXISTING,
      postCreateCommand: 'make bootstrap',
    });
  });

  it('trims the supplied command', () => {
    expect(buildNextConfig(undefined, { createCommand: '  my-tool create  ' })).toEqual({
      createCommand: 'my-tool create',
    });
  });

  it('clears a single command when given an empty string', () => {
    expect(buildNextConfig(EXISTING, { createCommand: '' })).toEqual({
      postCreateCommand: 'pnpm install',
      commandTimeoutMs: 60000,
    });
  });

  it('returns undefined for --clear', () => {
    expect(buildNextConfig(EXISTING, { clear: true })).toBeUndefined();
  });

  it('returns undefined when clearing the last configured command', () => {
    expect(
      buildNextConfig({ createCommand: 'my-tool create' }, { createCommand: '' })
    ).toBeUndefined();
  });

  it('parses the timeout', () => {
    expect(buildNextConfig(undefined, { timeout: '900000' })).toEqual({
      commandTimeoutMs: 900000,
    });
  });

  it.each(['0', '-5', 'abc'])('rejects an invalid timeout %s', (timeout) => {
    expect(() => buildNextConfig(undefined, { timeout })).toThrow('--timeout must be a positive');
  });
});
