// @vitest-environment node

/**
 * Elixir detector Unit Tests
 *
 * TDD Phase: RED → GREEN
 */

import { describe, it, expect, afterEach } from 'vitest';
import { detectElixir } from '@/infrastructure/services/deployment/detectors/elixir.detector.js';
import { cleanupFixtures, makeFixture } from '@tests/helpers/detector-fixture.helper.js';

const PHOENIX_MIX = [
  'defmodule App.MixProject do',
  '  use Mix.Project',
  '  defp deps do',
  '    [',
  '      {:phoenix, "~> 1.7"},',
  '      {:jason, "~> 1.2"}',
  '    ]',
  '  end',
  'end',
].join('\n');

const PLAIN_MIX = [
  'defmodule App.MixProject do',
  '  use Mix.Project',
  '  defp deps do',
  '    [{:jason, "~> 1.2"}]',
  '  end',
  'end',
].join('\n');

afterEach(() => cleanupFixtures());

describe('detectElixir', () => {
  it('resolves "mix phx.server" with the Phoenix default port', () => {
    const dir = makeFixture('elixir-phoenix', { 'mix.exs': PHOENIX_MIX });

    expect(detectElixir(dir)).toMatchObject({
      success: true,
      command: 'mix phx.server',
      framework: 'Phoenix',
      expectedPort: 4000,
      language: 'Elixir',
      runtime: 'mix',
      setupCommands: ['mix deps.get'],
      resolvedDir: dir,
    });
  });

  it('resolves the plain mix command with no port for a non-Phoenix project', () => {
    const dir = makeFixture('elixir-plain', { 'mix.exs': PLAIN_MIX });

    const result = detectElixir(dir);

    expect(result).toMatchObject({ command: 'mix run --no-halt' });
    expect(result.success && result.expectedPort).toBeUndefined();
    expect(result.success && result.framework).toBeUndefined();
  });

  it('does not treat a commented mention of phoenix as a dependency', () => {
    const dir = makeFixture('elixir-comment', {
      'mix.exs': `# we used to depend on :phoenix here\n${PLAIN_MIX}\n`,
    });

    expect(detectElixir(dir)).toMatchObject({ command: 'mix run --no-halt' });
  });

  it('sets needsInstall from the deps directory', () => {
    const missing = makeFixture('elixir-nodeps', { 'mix.exs': PLAIN_MIX });
    const present = makeFixture('elixir-deps', { 'mix.exs': PLAIN_MIX }, ['deps']);

    expect(detectElixir(missing)).toMatchObject({ needsInstall: true });
    expect(detectElixir(present)).toMatchObject({ needsInstall: false });
  });
});

describe('detectElixir — fall-through', () => {
  it('falls through when mix.exs is absent', () => {
    const dir = makeFixture('elixir-none');

    expect(detectElixir(dir).success).toBe(false);
  });

  it('never reads another ecosystem manifest when mix.exs is absent', () => {
    const dir = makeFixture('elixir-gate', { 'package.json': '{:phoenix, "~> 1.7"}' });

    expect(detectElixir(dir).success).toBe(false);
  });
});
