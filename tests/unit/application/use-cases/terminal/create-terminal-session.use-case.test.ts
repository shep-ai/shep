import 'reflect-metadata';
import { describe, it, expect, vi } from 'vitest';
import { CreateTerminalSessionUseCase } from '../../../../../packages/core/src/application/use-cases/terminal/create-terminal-session.use-case.js';
import type { ITerminalSessionService } from '../../../../../packages/core/src/application/ports/output/services/terminal-session-service.interface.js';

function makeService(): ITerminalSessionService {
  return {
    create: vi.fn(() => ({ id: 'sess-1', shell: '/bin/bash', cwd: '/tmp' })),
    write: vi.fn(),
    resize: vi.fn(),
    subscribe: vi.fn(() => () => {
      /* unsubscribe noop */
    }),
    exists: vi.fn(() => true),
    close: vi.fn(),
  };
}

describe('CreateTerminalSessionUseCase', () => {
  it('delegates to the terminal service with the provided cwd and size', () => {
    const service = makeService();
    const useCase = new CreateTerminalSessionUseCase(service);

    const result = useCase.execute({ cwd: '/tmp', cols: 120, rows: 30 });

    expect(service.create).toHaveBeenCalledWith({ cwd: '/tmp', cols: 120, rows: 30 });
    expect(result).toEqual({ id: 'sess-1', shell: '/bin/bash', cwd: '/tmp' });
  });

  it('rejects blank cwd values', () => {
    const service = makeService();
    const useCase = new CreateTerminalSessionUseCase(service);

    expect(() => useCase.execute({ cwd: '' })).toThrow(/cwd is required/);
    expect(() => useCase.execute({ cwd: '   ' })).toThrow(/cwd is required/);
    expect(service.create).not.toHaveBeenCalled();
  });

  it('forwards undefined size when omitted', () => {
    const service = makeService();
    const useCase = new CreateTerminalSessionUseCase(service);

    useCase.execute({ cwd: '/work' });

    expect(service.create).toHaveBeenCalledWith({
      cwd: '/work',
      cols: undefined,
      rows: undefined,
    });
  });
});
