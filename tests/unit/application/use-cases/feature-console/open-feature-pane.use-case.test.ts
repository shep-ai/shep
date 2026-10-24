/**
 * OpenFeaturePaneUseCase Unit Tests (spec 143)
 *
 * The console's t/T/f/F keys: open a shell in the feature's worktree, or its
 * followed agent log, in a multiplexer pane — or, with no multiplexer, hand
 * back a plan the caller runs in its own terminal. Never throws.
 *
 * TDD Phase: RED-GREEN-REFACTOR
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { OpenFeaturePaneUseCase } from '@/application/use-cases/feature-console/open-feature-pane.use-case.js';
import {
  FeaturePaneContent,
  FeaturePaneOutcome,
  FeaturePanePlacement,
  TerminalMultiplexer,
} from '@/domain/generated/output.js';
import type { Feature } from '@/domain/generated/output.js';
import type { TerminalPaneRequest } from '@/application/ports/output/services/terminal-pane-launcher.interface.js';

const SHEP = ['/usr/bin/node', '/opt/shep/cli.js'];
const COMPUTED_WORKTREE = '/home/u/.shep/repos/abc/wt/feat-login';

describe('OpenFeaturePaneUseCase', () => {
  let feature: Feature | null;
  let existing: Set<string>;
  let multiplexer: TerminalMultiplexer | undefined;
  let featureRepo: { findById: ReturnType<typeof vi.fn>; findByIdPrefix: ReturnType<typeof vi.fn> };
  let launcher: {
    detect: ReturnType<typeof vi.fn>;
    open: ReturnType<typeof vi.fn<(request: TerminalPaneRequest) => Promise<void>>>;
    defaultShell: ReturnType<typeof vi.fn>;
  };
  let useCase: OpenFeaturePaneUseCase;

  const execute = (
    content = FeaturePaneContent.Shell,
    placement = FeaturePanePlacement.Split,
    environment: Record<string, string> = {}
  ) =>
    useCase.execute({ featureId: 'feat-1234', content, placement, shepCommand: SHEP, environment });

  beforeEach(() => {
    feature = {
      id: 'feat-1234567890',
      name: 'Login page',
      repositoryPath: '/work/acme',
      branch: 'feat/login',
      agentRunId: 'run-1',
    } as Feature;
    existing = new Set([COMPUTED_WORKTREE, '/work/acme']);
    multiplexer = TerminalMultiplexer.Tmux;
    featureRepo = {
      findById: vi.fn(async () => null),
      findByIdPrefix: vi.fn(async (prefix: string) =>
        feature?.id.startsWith(prefix) ? feature : null
      ),
    };
    launcher = {
      detect: vi.fn(() => multiplexer),
      open: vi.fn(async () => undefined),
      defaultShell: vi.fn(() => ['/bin/zsh']),
    };
    useCase = new OpenFeaturePaneUseCase(
      featureRepo as never,
      { getWorktreePath: () => COMPUTED_WORKTREE },
      { pathExists: (p: string) => existing.has(p) } as never,
      launcher as never
    );
  });

  it("opens the user's shell in the worktree, beside the console, with focus", async () => {
    const result = await execute();

    expect(result).toEqual({
      outcome: FeaturePaneOutcome.Opened,
      multiplexer: TerminalMultiplexer.Tmux,
      message: 'Opened a shell for Login page in tmux',
    });
    expect(launcher.open).toHaveBeenCalledWith({
      multiplexer: TerminalMultiplexer.Tmux,
      placement: FeaturePanePlacement.Split,
      cwd: COMPUTED_WORKTREE,
      title: 'shep feat-123',
      environment: {},
      focus: true,
    });
  });

  it('follows the agent log without taking focus, passing the environment through', async () => {
    const result = await execute(FeaturePaneContent.Log, FeaturePanePlacement.Window, {
      SHEP_HOME: '/h',
    });

    expect(result.message).toBe('Opened the log of Login page in tmux');
    expect(launcher.open).toHaveBeenCalledWith(
      expect.objectContaining({
        placement: FeaturePanePlacement.Window,
        title: 'shep feat-123 log',
        command: [...SHEP, 'feat', 'logs', '-f', 'feat-1234567890'],
        environment: { SHEP_HOME: '/h' },
        focus: false,
      })
    );
  });

  it('prefers the recorded worktree path when it exists', async () => {
    feature = { ...feature!, worktreePath: '/elsewhere/wt' };
    existing.add('/elsewhere/wt');

    await execute();

    expect(launcher.open.mock.calls[0][0].cwd).toBe('/elsewhere/wt');
  });

  it('falls back to the repository when no worktree exists on disk', async () => {
    existing = new Set(['/work/acme']);

    await execute();

    expect(launcher.open.mock.calls[0][0].cwd).toBe('/work/acme');
  });

  it('without a multiplexer, returns an inline plan with the shell or the log command', async () => {
    multiplexer = undefined;

    expect(await execute()).toEqual({
      outcome: FeaturePaneOutcome.Inline,
      cwd: COMPUTED_WORKTREE,
      command: ['/bin/zsh'],
      message: 'No terminal multiplexer: running a shell for Login page here',
    });
    expect(await execute(FeaturePaneContent.Log)).toMatchObject({
      outcome: FeaturePaneOutcome.Inline,
      command: [...SHEP, 'feat', 'logs', '-f', 'feat-1234567890'],
    });
    expect(launcher.open).not.toHaveBeenCalled();
  });

  it('refuses a log for a feature that never ran', async () => {
    feature = { ...feature!, agentRunId: undefined };

    expect(await execute(FeaturePaneContent.Log)).toEqual({
      outcome: FeaturePaneOutcome.Failed,
      message: 'Login page has no agent run yet.',
    });
  });

  it('reports an unknown feature and a multiplexer refusal without throwing', async () => {
    launcher.open.mockRejectedValue(new Error('tmux: no space for new pane'));
    expect(await execute()).toEqual({
      outcome: FeaturePaneOutcome.Failed,
      message: 'tmux: no space for new pane',
    });

    feature = null;
    expect(await execute()).toEqual({
      outcome: FeaturePaneOutcome.Failed,
      message: 'Feature not found: feat-1234',
    });
  });
});
