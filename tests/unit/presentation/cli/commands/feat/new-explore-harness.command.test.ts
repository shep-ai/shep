/**
 * `shep feat new --explore-harness [--explore-k <n>]` (spec 150, task-28):
 * the per-feature Explore override of the self-learning harness. The options
 * exist only while the selfLearning flag is on, and are passed straight into
 * the create use case.
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockResolve, mockCreateExecute, mockRemoteExecute, mockMessages, settings } = vi.hoisted(
  () => ({
    mockResolve: vi.fn(),
    mockCreateExecute: vi.fn(),
    mockRemoteExecute: vi.fn(),
    mockMessages: {
      newline: vi.fn(),
      success: vi.fn(),
      warning: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
    },
    settings: { featureFlags: {} as Record<string, boolean> },
  })
);

vi.mock('@/infrastructure/di/container.js', () => ({
  container: { resolve: (...args: unknown[]) => mockResolve(...args) },
}));

vi.mock('@/infrastructure/services/filesystem/shep-directory.service.js', () => ({
  getShepHomeDir: () => '/home/test/.shep',
}));

vi.mock('../../../../../../src/presentation/cli/ui/index.js', () => ({
  colors: {
    muted: (s: string) => s,
    accent: (s: string) => s,
    success: (s: string) => s,
    brand: (s: string) => s,
  },
  messages: mockMessages,
  spinner: vi.fn((_label: string, fn: () => Promise<unknown>) => fn()),
}));

vi.mock('@/infrastructure/services/settings.service.js', () => ({
  hasSettings: () => true,
  getSettings: () => ({ ...settings, workflow: { approvalGateDefaults: {} } }),
}));

import { createNewCommand } from '../../../../../../src/presentation/cli/commands/feat/new.command.js';

function option(long: string) {
  return createNewCommand().options.find((o) => o.long === long);
}

async function run(...args: string[]): Promise<void> {
  await createNewCommand().parseAsync(['Add a cache', ...args], { from: 'user' });
}

describe('shep feat new --explore-harness (spec 150)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    process.exitCode = undefined;
    settings.featureFlags = { selfLearning: true };
    mockResolve.mockImplementation((token: unknown) => {
      const key = typeof token === 'string' ? token : (token as { name?: string })?.name;
      if (key === 'CreateFeatureUseCase') return { execute: mockCreateExecute };
      if (key === 'CreateFeatureFromRemoteUseCase') return { execute: mockRemoteExecute };
      return {};
    });
    mockCreateExecute.mockResolvedValue({
      feature: {
        id: 'feat-001',
        name: 'Add a cache',
        branch: 'feat/add-a-cache',
        lifecycle: 'Requirements',
      },
    });
  });

  it('offers neither option while the selfLearning flag is off', () => {
    settings.featureFlags = { selfLearning: false };

    expect(option('--explore-harness')).toBeUndefined();
    expect(option('--explore-k')).toBeUndefined();
  });

  it('offers both options, stating the cost, while the flag is on', () => {
    expect(option('--explore-harness')?.description).toMatch(/4×/);
    expect(option('--explore-k')?.description).toMatch(/4k/);
  });

  it('passes exploreHarness to the create use case', async () => {
    await run('--explore-harness');

    expect(mockCreateExecute).toHaveBeenCalledWith(
      expect.objectContaining({ exploreHarness: true })
    );
    expect(mockCreateExecute.mock.calls[0][0]).not.toHaveProperty('exploreK');
  });

  it('passes the explore budget k with it', async () => {
    await run('--explore-harness', '--explore-k', '3');

    expect(mockCreateExecute).toHaveBeenCalledWith(
      expect.objectContaining({ exploreHarness: true, exploreK: 3 })
    );
  });

  it('leaves both out of the input without --explore-harness', async () => {
    await run();

    const input = mockCreateExecute.mock.calls[0][0];
    expect(input).not.toHaveProperty('exploreHarness');
    expect(input).not.toHaveProperty('exploreK');
  });

  it('refuses --explore-k without --explore-harness', async () => {
    await run('--explore-k', '2');

    expect(mockCreateExecute).not.toHaveBeenCalled();
    expect(mockMessages.error).toHaveBeenCalledWith(expect.stringContaining('--explore-harness'));
    expect(process.exitCode).toBe(1);
  });

  it.each(['0', '6', '2.5', 'two'])('refuses --explore-k %s', async (k) => {
    await run('--explore-harness', '--explore-k', k);

    expect(mockCreateExecute).not.toHaveBeenCalled();
    expect(mockMessages.error).toHaveBeenCalledWith(expect.stringContaining(k));
    expect(process.exitCode).toBe(1);
  });

  it('passes --explore-harness and its k through --remote too', async () => {
    await run('--explore-harness', '--explore-k', '2', '--remote', 'acme/app');

    expect(mockRemoteExecute).toHaveBeenCalledWith(
      expect.objectContaining({ exploreHarness: true, exploreK: 2, remoteUrl: 'acme/app' })
    );
  });
});
