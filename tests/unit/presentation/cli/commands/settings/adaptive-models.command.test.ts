import 'reflect-metadata';
import { describe, it, expect } from 'vitest';
import {
  buildNextAdaptiveConfig,
  createAdaptiveModelsCommand,
} from '@/presentation/cli/commands/settings/adaptive-models.command.js';

describe('buildNextAdaptiveConfig', () => {
  it('returns null for a read-only invocation so the command just prints', () => {
    expect(buildNextAdaptiveConfig({ enabled: true }, {})).toBeNull();
  });

  it('enables the mode, preserving existing overrides', () => {
    expect(
      buildNextAdaptiveConfig({ enabled: false, low: 'claude-haiku-4-5' }, { enable: true })
    ).toEqual({ enabled: true, low: 'claude-haiku-4-5' });
  });

  it('disables the mode without discarding tier overrides', () => {
    expect(
      buildNextAdaptiveConfig({ enabled: true, low: 'claude-haiku-4-5' }, { disable: true })
    ).toEqual({ enabled: false, low: 'claude-haiku-4-5' });
  });

  it('creates a config from nothing when the mode is enabled for the first time', () => {
    expect(buildNextAdaptiveConfig(undefined, { enable: true })).toEqual({ enabled: true });
  });

  it('rejects contradictory flags rather than silently picking one', () => {
    expect(() => buildNextAdaptiveConfig(undefined, { enable: true, disable: true })).toThrow(
      /cannot be used together/
    );
  });

  it('sets a tier override', () => {
    expect(buildNextAdaptiveConfig({ enabled: true }, { low: 'claude-haiku-4-5' })).toEqual({
      enabled: true,
      low: 'claude-haiku-4-5',
    });
  });

  it('treats an empty tier value as "go back to derived"', () => {
    expect(
      buildNextAdaptiveConfig({ enabled: true, low: 'claude-haiku-4-5' }, { low: '' })
    ).toEqual({ enabled: true });
  });

  it('--clear drops every override but keeps the on/off state', () => {
    expect(
      buildNextAdaptiveConfig({ enabled: true, high: 'a', medium: 'b', low: 'c' }, { clear: true })
    ).toEqual({ enabled: true });
  });

  it('--clear combined with --disable turns the mode off too', () => {
    expect(
      buildNextAdaptiveConfig({ enabled: true, low: 'c' }, { clear: true, disable: true })
    ).toEqual({ enabled: false });
  });

  it('trims whitespace around a supplied model id', () => {
    expect(buildNextAdaptiveConfig(undefined, { high: '  claude-opus-5  ' })).toEqual({
      enabled: false,
      high: 'claude-opus-5',
    });
  });
});

describe('createAdaptiveModelsCommand', () => {
  it('registers under the name the settings group expects', () => {
    expect(createAdaptiveModelsCommand().name()).toBe('adaptive-models');
  });

  it('exposes every documented flag', () => {
    const flags = createAdaptiveModelsCommand()
      .options.map((o) => o.long)
      .filter(Boolean);
    expect(flags).toEqual(
      expect.arrayContaining(['--enable', '--disable', '--high', '--medium', '--low', '--clear'])
    );
  });
});
