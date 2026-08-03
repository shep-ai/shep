/**
 * Resume Agent Session Use Case
 *
 * Reopens an existing agent CLI conversation in shep's embedded terminal, and
 * exposes the resume descriptor so the clipboard and IDE surfaces render the
 * same invocation rather than each composing their own (which is how the
 * shipped `--project` bug happened).
 *
 * The terminal port spawns a shell and accepts written input, so the command is
 * written into that shell. Session ids come from filenames on disk, so
 * buildAgentResumeDescriptor rejects any id containing shell metacharacters
 * rather than attempting to escape it.
 */

import { injectable, inject } from 'tsyringe';
import type { AgentType } from '../../../domain/generated/output.js';
import {
  buildAgentResumeDescriptor,
  type AgentResumeDescriptor,
} from '../../../domain/shared/agent-resume-descriptor.js';
import type {
  CreatedTerminalSession,
  ITerminalSessionService,
} from '../../ports/output/services/terminal-session-service.interface.js';
import { CreateTerminalSessionUseCase } from '../terminal/create-terminal-session.use-case.js';

export interface ResumeAgentSessionInput {
  /** Provider-native session id */
  sessionId: string;
  /** Agent provider that owns the session */
  agentType: AgentType | string;
  /** Working directory the agent resolves the session from */
  cwd: string;
  cols?: number;
  rows?: number;
}

export interface ResumeAgentSessionResult {
  /** The PTY session now running the resume command */
  terminal: CreatedTerminalSession;
  /** How the session was resumed — safe to display or copy */
  descriptor: AgentResumeDescriptor;
}

/** Raised when the provider or session id cannot produce a resume command. */
export class AgentResumeUnsupportedError extends Error {
  constructor(
    public readonly agentType: string,
    public readonly reason: string
  ) {
    super(`Cannot resume a "${agentType}" session: ${reason}`);
    this.name = 'AgentResumeUnsupportedError';
  }
}

@injectable()
export class ResumeAgentSessionUseCase {
  constructor(
    @inject(CreateTerminalSessionUseCase)
    private readonly createTerminal: CreateTerminalSessionUseCase,
    @inject('ITerminalSessionService')
    private readonly terminals: ITerminalSessionService
  ) {}

  /**
   * Build the resume descriptor without starting anything.
   *
   * Used by the copy-command and open-in-IDE surfaces so they never rebuild the
   * invocation themselves.
   */
  describe(input: Omit<ResumeAgentSessionInput, 'cols' | 'rows'>): AgentResumeDescriptor {
    const descriptor = buildAgentResumeDescriptor(input.agentType, input.sessionId, input.cwd);

    if (descriptor === null) {
      throw new AgentResumeUnsupportedError(
        String(input.agentType),
        'no known resume command, or the session id is not safe to run'
      );
    }

    return descriptor;
  }

  async execute(input: ResumeAgentSessionInput): Promise<ResumeAgentSessionResult> {
    // Validate before spawning, so an unsupported provider never leaves a
    // stray idle terminal behind.
    const descriptor = this.describe(input);

    const terminal = await this.createTerminal.execute({
      cwd: descriptor.cwd,
      cols: input.cols,
      rows: input.rows,
    });

    // The PTY is a shell, so the resume command has to be written into it.
    // Without this the user would get a bare prompt rather than their session.
    this.terminals.write(terminal.id, `${descriptor.displayCommand}\n`);

    return { terminal, descriptor };
  }
}
