/**
 * OpenControlCenterUseCase Unit Tests (spec 146)
 *
 * One window per requested feature, each following that feature's agent log
 * and named by the caller. Never throws.
 *
 * TDD Phase: RED-GREEN-REFACTOR
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OpenControlCenterUseCase } from '@/application/use-cases/feature-console/open-control-center.use-case.js';
import {
  FeaturePaneContent,
  FeaturePaneOutcome,
  FeaturePanePlacement,
  TerminalMultiplexer,
} from '@/domain/generated/output.js';

const SHEP = ['/usr/bin/node', '/opt/shep/cli.js'];

describe('OpenControlCenterUseCase', () => {
  let multiplexer: TerminalMultiplexer | undefined;
  let openPane: { execute: ReturnType<typeof vi.fn> };
  let launcher: { detect: ReturnType<typeof vi.fn>; renameWindow: ReturnType<typeof vi.fn> };
  let useCase: OpenControlCenterUseCase;

  beforeEach(() => {
    multiplexer = TerminalMultiplexer.WezTerm;
    let next = 10;
    openPane = {
      execute: vi.fn(async () => ({
        outcome: FeaturePaneOutcome.Opened,
        multiplexer,
        windowId: String(next++),
        message: 'ok',
      })),
    };
    launcher = { detect: vi.fn(() => multiplexer), renameWindow: vi.fn(async () => undefined) };
    useCase = new OpenControlCenterUseCase(openPane as never, launcher as never);
  });

  const execute = () =>
    useCase.execute({
      features: [
        { featureId: 'f1', title: '● Billing' },
        { featureId: 'f2', title: '◆ Dark mode' },
      ],
      shepCommand: SHEP,
      environment: { SHEP_HOME: '/h' },
    });

  it('opens a titled log window per feature and names each one', async () => {
    const result = await execute();

    expect(openPane.execute).toHaveBeenCalledWith({
      featureId: 'f1',
      content: FeaturePaneContent.Log,
      placement: FeaturePanePlacement.Window,
      shepCommand: SHEP,
      environment: { SHEP_HOME: '/h' },
      title: '● Billing',
    });
    expect(launcher.renameWindow).toHaveBeenCalledWith(
      TerminalMultiplexer.WezTerm,
      '11',
      '◆ Dark mode'
    );
    expect(result).toEqual({
      outcome: FeaturePaneOutcome.Opened,
      multiplexer: TerminalMultiplexer.WezTerm,
      windows: [
        { featureId: 'f1', windowId: '10' },
        { featureId: 'f2', windowId: '11' },
      ],
      message: 'Opened 2 windows in wezterm',
    });
  });

  it('reports features it could not open and keeps going', async () => {
    openPane.execute.mockResolvedValueOnce({
      outcome: FeaturePaneOutcome.Failed,
      message: 'f1 has no agent run yet.',
    });

    const result = await execute();

    expect(result.windows).toEqual([{ featureId: 'f2', windowId: '10' }]);
    expect(result.message).toBe('Opened 1 window in wezterm; 1 failed: f1 has no agent run yet.');
  });

  it('opens nothing without a multiplexer', async () => {
    multiplexer = undefined;

    const result = await execute();

    expect(openPane.execute).not.toHaveBeenCalled();
    expect(result).toEqual({
      outcome: FeaturePaneOutcome.Failed,
      windows: [],
      message: 'The control center needs tmux, Zellij, WezTerm or kitty.',
    });
  });

  it('fails when every feature failed, and ignores a refused rename', async () => {
    launcher.renameWindow.mockRejectedValue(new Error('gone'));
    openPane.execute.mockResolvedValue({ outcome: FeaturePaneOutcome.Failed, message: 'nope' });

    expect((await execute()).outcome).toBe(FeaturePaneOutcome.Failed);
  });
});
