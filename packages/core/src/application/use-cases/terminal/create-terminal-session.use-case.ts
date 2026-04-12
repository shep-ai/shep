/**
 * Create Terminal Session Use Case
 *
 * Opens a new interactive PTY session rooted at an application's working
 * directory (or any caller-supplied cwd). Returns an opaque session id
 * that presentation layers use for subsequent input/output/resize calls.
 */

import { inject, injectable } from 'tsyringe';
import type {
  CreatedTerminalSession,
  ITerminalSessionService,
} from '../../ports/output/services/terminal-session-service.interface.js';

export interface CreateTerminalSessionCommand {
  cwd: string;
  cols?: number;
  rows?: number;
}

@injectable()
export class CreateTerminalSessionUseCase {
  constructor(
    @inject('ITerminalSessionService')
    private readonly terminals: ITerminalSessionService
  ) {}

  execute(command: CreateTerminalSessionCommand): CreatedTerminalSession {
    if (!command.cwd || command.cwd.trim().length === 0) {
      throw new Error('cwd is required to create a terminal session');
    }
    return this.terminals.create({
      cwd: command.cwd,
      cols: command.cols,
      rows: command.rows,
    });
  }
}
