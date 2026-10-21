/**
 * DeadAgentSessionRecovery
 *
 * Runs a session boot and, when the agent reports that the conversation being
 * resumed no longer exists ({@link AgentSessionNotFoundError}), forgets that id
 * and runs the boot once more on a new conversation — so the user gets a
 * working chat rather than a failure that every later boot would repeat.
 *
 * Forgetting the id means dropping it from every place a later boot would find
 * it: the session's own state, the registry's stopped-session cache and the DB.
 * Any other failure — and a failure of the fresh retry — propagates unchanged,
 * keeping the id for a later retry.
 *
 * Extracted from `SessionBootstrapper` so the bootstrapper only orchestrates.
 */

import type { IInteractiveSessionRepository } from '../../../../application/ports/output/repositories/interactive-session-repository.interface.js';
import type { ILogger } from '../../../../application/ports/output/services/logger.interface.js';
import { AgentSessionNotFoundError } from '../../../../application/ports/output/agents/agent-session-not-found.error.js';
import type { SessionRegistry, SessionState } from '../core/session-registry.js';
import type { StreamEventDispatcher } from '../core/stream-event-dispatcher.js';

/** Shown in the chat when a resumed conversation turned out to be gone. */
export const NEW_CONVERSATION_NOTICE =
  'The previous conversation is no longer available — starting a new one.';

export class DeadAgentSessionRecovery {
  constructor(
    private readonly sessionRepo: IInteractiveSessionRepository,
    private readonly registry: SessionRegistry,
    private readonly dispatcher: StreamEventDispatcher,
    private readonly logger: ILogger
  ) {}

  /**
   * Run `boot`; if it fails because the resumed conversation is gone and the
   * session is still live, forget the dead id and run `boot` once more.
   */
  async run(state: SessionState, boot: () => Promise<void>): Promise<void> {
    // The first attempt consumes the first turn; a fresh retry must send it again.
    const firstTurn = state.pendingUserContent;
    try {
      await boot();
    } catch (err) {
      if (!(err instanceof AgentSessionNotFoundError) || !this.registry.has(state.sessionId)) {
        throw err;
      }
      await this.forget(state, err);
      state.pendingUserContent ??= firstTurn;
      await boot();
    }
  }

  /**
   * Drop an agent session id the agent no longer has from every place a
   * later boot would find it: this session, the stopped-session cache and
   * the DB. Best-effort on the DB — the fresh boot persists a new id on a
   * newer row either way.
   */
  private async forget(state: SessionState, err: AgentSessionNotFoundError): Promise<void> {
    this.logger.warn(
      `[InteractiveSession] agent session ${err.agentSessionId} for feature ${state.featureId} ` +
        `no longer exists on the agent's side — starting a new conversation.`,
      { sessionId: state.sessionId, featureId: state.featureId, error: err.message }
    );
    this.dispatcher.notify(state, { delta: '', done: false, log: NEW_CONVERSATION_NOTICE });
    const deadHandle = state.handle;
    state.handle = null;
    state.agentSessionId = undefined;
    state.currentAssistantBuffer = '';
    state.toolEventsLog = [];
    this.registry.deleteStoppedAgentSessionId(state.featureId);
    try {
      await deadHandle?.close();
    } catch {
      // The agent process is already gone or going.
    }
    try {
      await this.sessionRepo.clearAgentSessionIdsForFeature(state.featureId);
    } catch (dbErr) {
      this.logger.warn(
        `[InteractiveSession] could not clear agent session ids for feature ${state.featureId}`,
        { featureId: state.featureId, error: dbErr }
      );
    }
  }
}
