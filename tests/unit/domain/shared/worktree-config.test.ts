/**
 * Worktree Config Rules Unit Tests
 *
 * `normalizeWorktreeConfig` is the single definition of "blank means unset"
 * shared by the SQLite mapper, the hook runner and both presentation layers,
 * so its edge cases are pinned here.
 */

import { describe, it, expect } from 'vitest';
import {
  DEFAULT_WORKTREE_COMMAND_TIMEOUT_MS,
  normalizeWorktreeConfig,
  resolveWorktreeCommandTimeoutMs,
} from '@/domain/shared/worktree-config.js';

describe('normalizeWorktreeConfig', () => {
  it('returns undefined for an undefined config', () => {
    expect(normalizeWorktreeConfig(undefined)).toBeUndefined();
  });

  it('returns undefined for an empty config', () => {
    expect(normalizeWorktreeConfig({})).toBeUndefined();
  });

  it('returns undefined when every command is blank', () => {
    expect(normalizeWorktreeConfig({ createCommand: '  ', postCreateCommand: '' })).toBeUndefined();
  });

  it('trims commands', () => {
    expect(normalizeWorktreeConfig({ createCommand: '  my-tool create  ' })).toEqual({
      createCommand: 'my-tool create',
    });
  });

  it('drops only the blank command and keeps the other', () => {
    expect(
      normalizeWorktreeConfig({ createCommand: '   ', postCreateCommand: 'pnpm install' })
    ).toEqual({ postCreateCommand: 'pnpm install' });
  });

  it('keeps a positive timeout', () => {
    expect(normalizeWorktreeConfig({ commandTimeoutMs: 1000 })).toEqual({
      commandTimeoutMs: 1000,
    });
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])('drops a %s timeout', (timeout) => {
    expect(normalizeWorktreeConfig({ commandTimeoutMs: timeout })).toBeUndefined();
  });
});

describe('resolveWorktreeCommandTimeoutMs', () => {
  it('falls back to the default when unconfigured', () => {
    expect(resolveWorktreeCommandTimeoutMs(undefined)).toBe(DEFAULT_WORKTREE_COMMAND_TIMEOUT_MS);
    expect(resolveWorktreeCommandTimeoutMs({})).toBe(DEFAULT_WORKTREE_COMMAND_TIMEOUT_MS);
  });

  it('falls back to the default for a non-positive timeout', () => {
    expect(resolveWorktreeCommandTimeoutMs({ commandTimeoutMs: 0 })).toBe(
      DEFAULT_WORKTREE_COMMAND_TIMEOUT_MS
    );
  });

  it('uses the configured timeout', () => {
    expect(resolveWorktreeCommandTimeoutMs({ commandTimeoutMs: 42 })).toBe(42);
  });
});
