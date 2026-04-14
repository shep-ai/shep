/**
 * Send Interactive Message Use Case
 *
 * Sends a user message to the interactive session for a feature.
 * The service handles session lifecycle: starts a session if needed,
 * queues the message if the session is booting, or delivers immediately
 * if the session is ready.
 */

import { injectable, inject } from 'tsyringe';
import type { IInteractiveSessionService } from '../../ports/output/services/interactive-session-service.interface.js';
import type { InteractiveMessage } from '../../../domain/generated/output.js';

/**
 * Input for sending a message to an interactive session.
 */
export interface SendInteractiveMessageInput {
  featureId: string;
  content: string;
  worktreePath: string;
  model?: string;
  agentType?: string;
  /**
   * Optional system prompt for the agent SDK. Kept on the input for
   * forward-compatibility, but NOTE: the Claude Agent SDK V2 session
   * API (`unstable_v2_createSession`) does not honor this field — any
   * value passed here is silently dropped by the SDK. Application
   * creation instead delivers its brief via {@link agentKickoffOverride}
   * + a `SHEP_BRIEF.md` file in the cwd (see `CreateApplicationUseCase`).
   */
  systemPrompt?: string;
  /**
   * When set AND this call boots a new session, this string is sent
   * to the agent as the FIRST-turn content instead of `content`. The
   * UI still shows `content` as the user's first bubble; the agent
   * sees `agentKickoffOverride`. Used to inject a hidden directive
   * (e.g. "read SHEP_BRIEF.md before anything else") without
   * cluttering the chat transcript.
   */
  agentKickoffOverride?: string;
  /**
   * When false, the session service SKIPS the step that persists a
   * user message row for `content`. Used by long-running creation
   * flows that have ALREADY persisted the user's first bubble in the
   * foreground (so the UI renders it instantly) and only need this
   * call for the session boot + agent-side kickoff. Defaults to
   * `true` — every normal chat message persists a row.
   */
  persistUserMessage?: boolean;
}

/**
 * Use case for sending a user message to an interactive agent session.
 *
 * Algorithm:
 * 1. Delegate to service.sendUserMessage with featureId, content, worktreePath
 * 2. Return the persisted user message
 */
@injectable()
export class SendInteractiveMessageUseCase {
  constructor(
    @inject('IInteractiveSessionService')
    private readonly service: IInteractiveSessionService
  ) {}

  async execute(input: SendInteractiveMessageInput): Promise<InteractiveMessage> {
    return this.service.sendUserMessage(
      input.featureId,
      input.content,
      input.worktreePath,
      input.model,
      input.agentType,
      input.systemPrompt,
      input.agentKickoffOverride,
      input.persistUserMessage
    );
  }
}
