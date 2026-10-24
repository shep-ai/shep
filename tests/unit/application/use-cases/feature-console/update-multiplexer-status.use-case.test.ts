/**
 * UpdateMultiplexerStatusUseCase Unit Tests (spec 146)
 *
 * Renames the console's windows and publishes its status values; reports the
 * windows the multiplexer no longer has. Never throws.
 *
 * TDD Phase: RED-GREEN-REFACTOR
 */

import 'reflect-metadata';
import { describe, it, expect, vi } from 'vitest';
import { UpdateMultiplexerStatusUseCase } from '@/application/use-cases/feature-console/update-multiplexer-status.use-case.js';
import { TerminalMultiplexer } from '@/domain/generated/output.js';

describe('UpdateMultiplexerStatusUseCase', () => {
  it('renames each window and publishes the status', async () => {
    const launcher = {
      detect: () => TerminalMultiplexer.Tmux,
      renameWindow: vi.fn(async () => undefined),
      publishStatus: vi.fn(async () => undefined),
    };
    const useCase = new UpdateMultiplexerStatusUseCase(launcher as never);

    const result = await useCase.execute({
      renames: [{ windowId: '@1', title: '✓ Billing' }],
      status: { '@shep_needs_you': '0' },
    });

    expect(launcher.renameWindow).toHaveBeenCalledWith(TerminalMultiplexer.Tmux, '@1', '✓ Billing');
    expect(launcher.publishStatus).toHaveBeenCalledWith(TerminalMultiplexer.Tmux, {
      '@shep_needs_you': '0',
    });
    expect(result).toEqual({ goneWindowIds: [] });
  });

  it('reports windows it could not rename, and survives a refused status', async () => {
    const launcher = {
      detect: () => TerminalMultiplexer.Tmux,
      renameWindow: vi.fn(async (_m: unknown, id: string) => {
        if (id === '@2') throw new Error("can't find window");
      }),
      publishStatus: vi.fn(async () => {
        throw new Error('no server');
      }),
    };
    const useCase = new UpdateMultiplexerStatusUseCase(launcher as never);

    const result = await useCase.execute({
      renames: [
        { windowId: '@1', title: 'a' },
        { windowId: '@2', title: 'b' },
      ],
      status: { '@shep_status': 'x' },
    });

    expect(result).toEqual({ goneWindowIds: ['@2'] });
  });

  it('skips status publishing when given none', async () => {
    const launcher = {
      detect: () => TerminalMultiplexer.Tmux,
      renameWindow: vi.fn(),
      publishStatus: vi.fn(),
    };
    await new UpdateMultiplexerStatusUseCase(launcher as never).execute({
      renames: [],
    });
    expect(launcher.publishStatus).not.toHaveBeenCalled();
  });

  it('does nothing outside a multiplexer', async () => {
    const launcher = { detect: () => undefined, renameWindow: vi.fn(), publishStatus: vi.fn() };
    const result = await new UpdateMultiplexerStatusUseCase(launcher as never).execute({
      renames: [{ windowId: '@1', title: 'a' }],
      status: { '@shep_status': 'x' },
    });
    expect(result).toEqual({ goneWindowIds: [] });
    expect(launcher.renameWindow).not.toHaveBeenCalled();
    expect(launcher.publishStatus).not.toHaveBeenCalled();
  });
});
