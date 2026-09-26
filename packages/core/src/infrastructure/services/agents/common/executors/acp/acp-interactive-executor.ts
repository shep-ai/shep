/**
 * ACP Interactive Executor
 *
 * Agent-agnostic {@link IInteractiveAgentExecutor} for any agent CLI that
 * serves the Agent Client Protocol (https://agentclientprotocol.com) on stdio.
 * One agent process serves a whole chat session — every turn is a
 * `session/prompt` on the same connection, as LESSONS.md requires for
 * interactive chat — and a conversation is resumed with `session/load`.
 *
 * Everything agent-specific (binary, Windows launch, model ids, login hint,
 * extension methods) lives in an {@link AcpAgentProfile}; the protocol handling
 * lives in {@link AcpInteractiveSession}. Adding another ACP agent is a new
 * profile, not a new executor.
 */

import type {
  ClientApp,
  RequestPermissionRequest,
  RequestPermissionResponse,
} from '@agentclientprotocol/sdk';
import type {
  IInteractiveAgentExecutor,
  InteractiveAgentOptions,
  InteractiveAgentSessionHandle,
} from '../../../../../../application/ports/output/agents/interactive-agent-executor.interface.js';
import type { SpawnFunction } from '../../types.js';
import { AcpInteractiveSession } from './acp-interactive-session.js';

/**
 * How long the agent may take to answer `initialize` plus `session/new` or
 * `session/load`. Generous because `session/load` replays the whole
 * conversation before it returns.
 */
export const DEFAULT_ACP_HANDSHAKE_TIMEOUT_MS = 120_000;

/** The agent-specific facts an ACP session needs. */
export interface AcpAgentProfile {
  /** Human name used in every message the user can see. */
  readonly agentName: string;
  /** Shown when the binary is not on PATH. */
  readonly notFoundMessage: string;
  /** Shown when the agent answers "Authentication required". */
  readonly loginHint: string;
  /**
   * Appended when the agent exits or goes silent before the handshake
   * finishes — usually a CLI too old to have an ACP server.
   */
  readonly handshakeFailureHint?: string;
  /** Command line that starts the agent's ACP server; never contains user text. */
  launchCommand(): { command: string; args: string[] };
  /** Translate a Shep model id to the agent's model value. Identity when absent. */
  toAgentModel?(model: string): string;
  /**
   * Answer a permission request the agent-specific way, or return undefined
   * to let the session approve it once. For requests that are not tool
   * approvals at all — e.g. a question the agent routes through a permission
   * prompt — which approving would answer on the user's behalf.
   */
  resolvePermission?(request: RequestPermissionRequest): RequestPermissionResponse | undefined;
  /** Register agent-specific extension handlers on the client app. */
  registerExtensions?(app: ClientApp, options: InteractiveAgentOptions): void;
}

/** Tuning for {@link AcpInteractiveExecutor}. */
export interface AcpInteractiveExecutorOptions {
  /** Overrides {@link DEFAULT_ACP_HANDSHAKE_TIMEOUT_MS}. */
  handshakeTimeoutMs?: number;
}

export class AcpInteractiveExecutor implements IInteractiveAgentExecutor {
  constructor(
    private readonly spawn: SpawnFunction,
    private readonly profile: AcpAgentProfile,
    private readonly tuning: AcpInteractiveExecutorOptions = {}
  ) {}

  createSession(options: InteractiveAgentOptions): Promise<InteractiveAgentSessionHandle> {
    return this.open(options);
  }

  resumeSession(
    sessionId: string,
    options: InteractiveAgentOptions
  ): Promise<InteractiveAgentSessionHandle> {
    return this.open(options, sessionId);
  }

  private open(
    options: InteractiveAgentOptions,
    resumeSessionId?: string
  ): Promise<InteractiveAgentSessionHandle> {
    return AcpInteractiveSession.open(
      {
        spawn: this.spawn,
        profile: this.profile,
        handshakeTimeoutMs: this.tuning.handshakeTimeoutMs ?? DEFAULT_ACP_HANDSHAKE_TIMEOUT_MS,
      },
      options,
      resumeSessionId
    );
  }
}
