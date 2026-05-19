/**
 * Bedrock Domain Error Unit Tests
 *
 * Covers the four typed errors introduced for the project-bedrock
 * integration: BedrockNotEnabledError, PipxNotInstalledError,
 * BedrockBinaryMissingError, ClaudeSettingsMergeFailedError.
 *
 * TDD Phase: RED → GREEN
 */

import { describe, it, expect } from 'vitest';
import { BedrockNotEnabledError } from '@/domain/errors/bedrock-not-enabled.error.js';
import { PipxNotInstalledError } from '@/domain/errors/pipx-not-installed.error.js';
import { BedrockBinaryMissingError } from '@/domain/errors/bedrock-binary-missing.error.js';
import { ClaudeSettingsMergeFailedError } from '@/domain/errors/claude-settings-merge-failed.error.js';

describe('BedrockNotEnabledError', () => {
  it('is an instance of Error', () => {
    expect(new BedrockNotEnabledError('app-1')).toBeInstanceOf(Error);
  });

  it('carries the application id in the message', () => {
    const err = new BedrockNotEnabledError('app-42');
    expect(err.message).toContain('app-42');
  });

  it('exposes a stable code', () => {
    expect(new BedrockNotEnabledError('app-1').code).toBe('BEDROCK_NOT_ENABLED');
  });

  it('exposes a non-empty remediation string', () => {
    const err = new BedrockNotEnabledError('app-1');
    expect(err.remediation).toBeTypeOf('string');
    expect(err.remediation.length).toBeGreaterThan(0);
  });

  it('sets name to BedrockNotEnabledError', () => {
    expect(new BedrockNotEnabledError('app-1').name).toBe('BedrockNotEnabledError');
  });
});

describe('PipxNotInstalledError', () => {
  it('is an instance of Error', () => {
    expect(new PipxNotInstalledError()).toBeInstanceOf(Error);
  });

  it('exposes a stable code', () => {
    expect(new PipxNotInstalledError().code).toBe('PIPX_NOT_INSTALLED');
  });

  it('returns a darwin-specific remediation when platform is darwin', () => {
    const err = new PipxNotInstalledError('darwin');
    expect(err.remediation).toMatch(/brew install pipx/);
  });

  it('returns a linux-specific remediation when platform is linux', () => {
    const err = new PipxNotInstalledError('linux');
    expect(err.remediation).toMatch(/python3 -m pip install --user pipx/);
  });

  it('returns a windows-specific remediation when platform is win32', () => {
    const err = new PipxNotInstalledError('win32');
    expect(err.remediation).toMatch(/py -m pip install --user pipx/);
  });

  it('sets name to PipxNotInstalledError', () => {
    expect(new PipxNotInstalledError().name).toBe('PipxNotInstalledError');
  });
});

describe('BedrockBinaryMissingError', () => {
  it('is an instance of Error', () => {
    expect(new BedrockBinaryMissingError()).toBeInstanceOf(Error);
  });

  it('exposes a stable code', () => {
    expect(new BedrockBinaryMissingError().code).toBe('BEDROCK_BINARY_MISSING');
  });

  it('mentions pipx ensurepath in the remediation', () => {
    expect(new BedrockBinaryMissingError().remediation).toMatch(/pipx ensurepath/);
  });

  it('sets name to BedrockBinaryMissingError', () => {
    expect(new BedrockBinaryMissingError().name).toBe('BedrockBinaryMissingError');
  });
});

describe('ClaudeSettingsMergeFailedError', () => {
  it('is an instance of Error', () => {
    expect(new ClaudeSettingsMergeFailedError('bad json')).toBeInstanceOf(Error);
  });

  it('exposes a stable code', () => {
    expect(new ClaudeSettingsMergeFailedError('bad json').code).toBe(
      'CLAUDE_SETTINGS_MERGE_FAILED'
    );
  });

  it('carries the reason in the message and the reason property', () => {
    const err = new ClaudeSettingsMergeFailedError('hooks entry is not an array');
    expect(err.reason).toBe('hooks entry is not an array');
    expect(err.message).toContain('hooks entry is not an array');
  });

  it('exposes a non-empty remediation string', () => {
    const err = new ClaudeSettingsMergeFailedError('bad json');
    expect(err.remediation).toBeTypeOf('string');
    expect(err.remediation.length).toBeGreaterThan(0);
  });

  it('sets name to ClaudeSettingsMergeFailedError', () => {
    expect(new ClaudeSettingsMergeFailedError('bad json').name).toBe(
      'ClaudeSettingsMergeFailedError'
    );
  });
});
