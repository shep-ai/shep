import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';

const { settingsState, messagesError } = vi.hoisted(() => ({
  settingsState: { value: undefined as undefined | { featureFlags?: Record<string, boolean> } },
  messagesError: vi.fn(),
}));

vi.mock('@/infrastructure/services/settings.service.js', () => ({
  hasSettings: () => settingsState.value !== undefined,
  getSettings: () => settingsState.value,
}));

vi.mock('../../../../../src/presentation/cli/ui/index.js', () => ({
  messages: { error: messagesError },
}));

import { gateByFeatureFlag } from '../../../../../src/presentation/cli/commands/feature-flag-gate.js';

function group(): { cmd: Command; leaf: ReturnType<typeof vi.fn> } {
  const leaf = vi.fn();
  const cmd = new Command('space').addCommand(new Command('ls').action(leaf));
  return { cmd, leaf };
}

describe('gateByFeatureFlag (spec 135)', () => {
  let exitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`exit ${code}`);
    }) as never);
  });

  afterEach(() => exitSpy.mockRestore());

  it('leaves the group visible and runnable while its flag is on', async () => {
    settingsState.value = { featureFlags: { spaces: true } };
    const { cmd, leaf } = group();
    gateByFeatureFlag(cmd, 'spaces');

    await cmd.parseAsync(['ls'], { from: 'user' });

    expect((cmd as unknown as { _hidden: boolean })._hidden).toBe(false);
    expect(leaf).toHaveBeenCalled();
  });

  it('hides the group and refuses to run it while its flag is off', async () => {
    settingsState.value = { featureFlags: { spaces: false } };
    const { cmd, leaf } = group();
    gateByFeatureFlag(cmd, 'spaces');

    await expect(cmd.parseAsync(['ls'], { from: 'user' })).rejects.toThrow('exit 1');

    expect((cmd as unknown as { _hidden: boolean })._hidden).toBe(true);
    expect(leaf).not.toHaveBeenCalled();
    expect(messagesError).toHaveBeenCalledWith(
      expect.stringContaining('shep settings flags enable spaces')
    );
  });

  it('refuses a bare group invocation too, instead of printing its help', async () => {
    settingsState.value = { featureFlags: { factory: false } };
    const cmd = gateByFeatureFlag(new Command('factory'), 'factory');

    await expect(cmd.parseAsync([], { from: 'user' })).rejects.toThrow('exit 1');
  });

  it('runs while any of several flags is on', async () => {
    settingsState.value = { featureFlags: { trackers: false, knowledge: true } };
    const { cmd, leaf } = group();
    gateByFeatureFlag(cmd, ['trackers', 'knowledge']);

    await cmd.parseAsync(['ls'], { from: 'user' });

    expect(leaf).toHaveBeenCalled();
  });

  it('uses the default value when settings carry no value for the flag', async () => {
    settingsState.value = undefined;
    const on = group();
    gateByFeatureFlag(on.cmd, 'spaces');
    await on.cmd.parseAsync(['ls'], { from: 'user' });
    expect(on.leaf).toHaveBeenCalled();

    const off = group();
    gateByFeatureFlag(off.cmd, 'aspm');
    await expect(off.cmd.parseAsync(['ls'], { from: 'user' })).rejects.toThrow('exit 1');
  });
});
