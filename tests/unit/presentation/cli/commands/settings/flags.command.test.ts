/**
 * `shep settings flags` — lists every feature flag and turns one on or off
 * (spec 133). Logic lives in the List/SetFeatureFlag use cases.
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach, afterEach, type MockInstance } from 'vitest';
import { FeatureFlagGroup } from '@/domain/generated/output.js';

const { listUseCase, setUseCase, settingsService, messagesMock } = vi.hoisted(() => ({
  listUseCase: { execute: vi.fn() },
  setUseCase: { execute: vi.fn() },
  settingsService: { resetSettings: vi.fn(), initializeSettings: vi.fn() },
  messagesMock: { success: vi.fn(), error: vi.fn(), info: vi.fn(), newline: vi.fn() },
}));

vi.mock('@/infrastructure/di/container.js', () => ({
  container: {
    resolve: vi.fn((token: { name?: string }) =>
      token?.name === 'ListFeatureFlagsUseCase' ? listUseCase : setUseCase
    ),
  },
}));
vi.mock('@/application/use-cases/settings/list-feature-flags.use-case.js', () => ({
  ListFeatureFlagsUseCase: class ListFeatureFlagsUseCase {},
}));
vi.mock('@/application/use-cases/settings/set-feature-flag.use-case.js', () => ({
  SetFeatureFlagUseCase: class SetFeatureFlagUseCase {},
}));
vi.mock('@/infrastructure/services/settings.service.js', () => settingsService);
vi.mock('../../../../../../src/presentation/cli/ui/index.js', () => ({
  messages: messagesMock,
  colors: { success: (s: string) => s, muted: (s: string) => s },
  fmt: { heading: (s: string) => s },
}));

import { createFlagsCommand } from '../../../../../../src/presentation/cli/commands/settings/flags.command.js';

describe('shep settings flags', () => {
  const originalExitCode = process.exitCode;
  let logSpy: MockInstance<typeof console.log>;

  beforeEach(() => {
    vi.clearAllMocks();
    process.exitCode = 0;
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    process.exitCode = originalExitCode;
    logSpy.mockRestore();
  });

  it('lists every flag with its state, default and one-line description', async () => {
    listUseCase.execute.mockResolvedValue([
      {
        key: 'aspm',
        group: FeatureFlagGroup.Platform,
        description: 'Security posture management',
        enabled: true,
        defaultEnabled: false,
      },
      {
        key: 'spaces',
        group: FeatureFlagGroup.SoftwareFactory,
        description: 'Spaces and product lines',
        enabled: false,
        defaultEnabled: true,
      },
    ]);

    await createFlagsCommand().parseAsync([], { from: 'user' });

    const printed = logSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(printed).toMatch(/on\s+aspm\s+Security posture management \(default off\)/);
    expect(printed).toMatch(/off\s+spaces\s+Spaces and product lines \(default on\)/);
    expect(printed).toContain('Software factory');
  });

  it.each([
    ['enable', true],
    ['disable', false],
  ] as const)('%s turns one flag %s through the use case', async (verb, enabled) => {
    const updated = { featureFlags: { spaces: enabled } };
    setUseCase.execute.mockResolvedValue(updated);

    await createFlagsCommand().parseAsync([verb, 'spaces'], { from: 'user' });

    expect(setUseCase.execute).toHaveBeenCalledWith({ key: 'spaces', enabled });
    expect(settingsService.initializeSettings).toHaveBeenCalledWith(updated);
    expect(messagesMock.success).toHaveBeenCalled();
    expect(process.exitCode).toBe(0);
  });

  it('reports an unknown flag and exits 1', async () => {
    setUseCase.execute.mockRejectedValue(new Error('Unknown feature flag "nope"'));

    await createFlagsCommand().parseAsync(['enable', 'nope'], { from: 'user' });

    expect(messagesMock.error).toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });
});
