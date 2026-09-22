/**
 * `shep aspm` parent command tests (feature 098, phase 10).
 *
 * The whole surface is gated behind the `aspm` feature flag: when it is off the
 * command is hidden *and* any invocation must print the disabled notice instead
 * of exposing the subcommands.
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';

const settingsMock = vi.hoisted(() => ({
  hasSettings: vi.fn(),
  getSettings: vi.fn(),
}));

vi.mock('@/infrastructure/services/settings.service.js', () => ({
  hasSettings: settingsMock.hasSettings,
  getSettings: settingsMock.getSettings,
}));

// Every leaf factory is replaced by a bare named command so the test only
// observes gating, not the subcommands' own behaviour.
vi.mock('@/presentation/cli/commands/aspm/aspm-scan-command.js', () => ({
  createAspmScanCommand: () => new Command('scan').action(() => undefined),
  createAspmRescanCommand: () => new Command('rescan').action(() => undefined),
}));
vi.mock('@/presentation/cli/commands/aspm/aspm-ingest-command.js', () => ({
  createAspmIngestCommand: () => new Command('ingest').action(() => undefined),
}));
vi.mock('@/presentation/cli/commands/aspm/aspm-findings-command.js', () => ({
  createAspmFindingsCommand: () => new Command('findings').action(() => undefined),
}));
vi.mock('@/presentation/cli/commands/aspm/aspm-campaigns-command.js', () => ({
  createAspmCampaignsCommand: () => new Command('campaigns').action(() => undefined),
}));
vi.mock('@/presentation/cli/commands/aspm/aspm-posture-command.js', () => ({
  createAspmPostureCommand: () => new Command('posture').action(() => undefined),
}));
vi.mock('@/presentation/cli/commands/aspm/aspm-exceptions-command.js', () => ({
  createAspmExceptionsCommand: () => new Command('exceptions').action(() => undefined),
}));
vi.mock('@/presentation/cli/commands/aspm/aspm-ai-review-command.js', () => ({
  createAspmAiReviewCommand: () => new Command('ai-review').action(() => undefined),
}));

import { createAspmCommand } from '@/presentation/cli/commands/aspm/index.js';

const DISABLED_NOTICE = 'The ASPM module is disabled.';

describe('createAspmCommand feature-flag gating', () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    errorSpy.mockRestore();
    vi.restoreAllMocks();
  });

  function flagEnabled(enabled: boolean): void {
    settingsMock.hasSettings.mockReturnValue(true);
    settingsMock.getSettings.mockReturnValue({ featureFlags: { aspm: enabled } });
  }

  it('blocks a bare `shep aspm` with the disabled notice', async () => {
    flagEnabled(false);
    const cmd = createAspmCommand();

    const exit = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`__exit__${code}`);
    }) as never);

    await expect(cmd.parseAsync([], { from: 'user' })).rejects.toThrow('__exit__1');

    // The notice must reach the user, and Commander's default help — which
    // lists every ASPM subcommand — must not.
    const printed = errorSpy.mock.calls.map((call: unknown[]) => String(call[0])).join('\n');
    expect(printed).toContain(DISABLED_NOTICE);
    expect(printed).not.toContain('findings');

    exit.mockRestore();
  });

  it('still blocks `shep aspm findings` when the flag is off', async () => {
    flagEnabled(false);
    const cmd = createAspmCommand();

    const exit = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`__exit__${code}`);
    }) as never);

    await expect(cmd.parseAsync(['findings'], { from: 'user' })).rejects.toThrow('__exit__1');
    expect(errorSpy.mock.calls.map((call: unknown[]) => String(call[0])).join('\n')).toContain(
      DISABLED_NOTICE
    );

    exit.mockRestore();
  });

  it('hides the surface from help when the flag is off', () => {
    flagEnabled(false);
    const cmd = createAspmCommand();
    expect((cmd as unknown as { _hidden: boolean })._hidden).toBe(true);
  });

  it('registers every subcommand and stays visible when the flag is on', () => {
    flagEnabled(true);
    const cmd = createAspmCommand();

    expect(cmd.commands.map((c: { name(): string }) => c.name())).toEqual([
      'scan',
      'rescan',
      'ingest',
      'findings',
      'campaigns',
      'posture',
      'exceptions',
      'ai-review',
    ]);
    expect((cmd as unknown as { _hidden: boolean })._hidden).toBeFalsy();
  });
});
