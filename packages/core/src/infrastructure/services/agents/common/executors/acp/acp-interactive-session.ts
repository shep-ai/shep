/**
 * ACP Interactive Session
 *
 * One Agent Client Protocol connection to one agent process, exposed as the
 * {@link InteractiveAgentSessionHandle} the chat runtime drives:
 * `send(message)` starts a `session/prompt`, `stream()` yields that turn's
 * events until the prompt's response ends it.
 *
 * - `session/update` notifications are delivered only to the running turn.
 *   None runs while `session/load` replays history, so a resumed chat never
 *   re-shows old messages as new output.
 * - Tool permission requests are approved once ({@link approveOnce}) unless
 *   the agent profile answers them itself.
 * - The agent process dying ends the running turn with its exit code and
 *   stderr, and every later `send` fails fast with the same reason.
 */

import {
  client,
  PROTOCOL_VERSION,
  type ClientConnection,
  type NewSessionRequest,
  type PromptResponse,
  type SessionConfigOption,
  type SessionNotification,
} from '@agentclientprotocol/sdk';
import type {
  InteractiveAgentEvent,
  InteractiveAgentOptions,
  InteractiveAgentSessionHandle,
} from '../../../../../../application/ports/output/agents/interactive-agent-executor.interface.js';
import type { SpawnFunction } from '../../types.js';
import { EventChannel } from '../../../streaming/event-channel.js';
import type { AcpAgentProfile } from './acp-interactive-executor.js';
import { AcpAgentProcess } from './acp-process.js';
import {
  approveOnce,
  chooseModel,
  describeRequestError,
  handshakeFailure,
  isAuthRequired,
  stopReasonFailure,
} from './acp-protocol.js';
import { AcpUpdateTranslator } from './acp-update-translator.js';

const MS_PER_SECOND = 1000;

export interface AcpSessionConfig {
  spawn: SpawnFunction;
  profile: AcpAgentProfile;
  handshakeTimeoutMs: number;
}

/** The agent never answered the handshake (as opposed to answering with an error). */
class HandshakeTimeoutError extends Error {}

interface ActiveTurn {
  channel: EventChannel<InteractiveAgentEvent>;
  startedAt: number;
}

export class AcpInteractiveSession implements InteractiveAgentSessionHandle {
  private acpSessionId = '';
  private readonly connection: ClientConnection;
  private readonly translator = new AcpUpdateTranslator();
  private turn: ActiveTurn | null = null;
  /** Status lines for the next turn (e.g. a model that could not be selected). */
  private readonly notices: string[] = [];
  private closed = false;

  private constructor(
    private readonly agentProcess: AcpAgentProcess,
    private readonly profile: AcpAgentProfile,
    private readonly options: InteractiveAgentOptions
  ) {
    const app = client({ name: 'shep' })
      .onNotification('session/update', ({ params }) => this.onSessionUpdate(params))
      .onRequest(
        'session/request_permission',
        ({ params }) => profile.resolvePermission?.(params) ?? approveOnce(params)
      );
    profile.registerExtensions?.(app, options);
    this.connection = app.connect(agentProcess.stream);
    agentProcess.onDeath((error) => {
      this.connection.close(error);
      this.endTurn({ type: 'error', content: error.message });
    });
  }

  /** Start the agent, handshake, and create or load the ACP session. */
  static async open(
    config: AcpSessionConfig,
    options: InteractiveAgentOptions,
    resumeSessionId?: string
  ): Promise<AcpInteractiveSession> {
    const { profile } = config;
    const { command, args } = profile.launchCommand();
    const agentProcess = AcpAgentProcess.start({
      spawn: config.spawn,
      command,
      args,
      cwd: options.cwd,
      agentName: profile.agentName,
      notFoundMessage: profile.notFoundMessage,
    });
    const session = new AcpInteractiveSession(agentProcess, profile, options);
    try {
      await withTimeout(
        session.establish(resumeSessionId),
        config.handshakeTimeoutMs,
        () =>
          new HandshakeTimeoutError(
            `${profile.agentName} did not respond to the ACP handshake within ` +
              `${config.handshakeTimeoutMs / MS_PER_SECOND}s.`
          )
      );
    } catch (error) {
      agentProcess.terminate();
      throw handshakeFailure(error, {
        profile,
        processDeath: agentProcess.deathError,
        timedOut: error instanceof HandshakeTimeoutError,
      });
    }
    return session;
  }

  get sessionId(): string {
    return this.acpSessionId;
  }

  async send(message: string): Promise<void> {
    if (this.closed) throw new Error(`${this.profile.agentName} session is closed`);
    if (this.agentProcess.deathError) throw this.agentProcess.deathError;
    if (this.turn) throw new Error(`${this.profile.agentName}: a turn is already in progress`);

    const turn: ActiveTurn = { channel: new EventChannel(), startedAt: Date.now() };
    this.turn = turn;
    for (const content of this.notices.splice(0)) turn.channel.push({ type: 'status', content });

    this.connection.agent
      .request('session/prompt', {
        sessionId: this.acpSessionId,
        prompt: [{ type: 'text', text: message }],
      })
      .then(
        (response) => this.finishTurn(turn, response),
        (error: unknown) => {
          if (this.turn !== turn) return;
          const reason = this.agentProcess.deathError?.message ?? this.describe(error);
          this.endTurn({ type: 'error', content: reason });
        }
      );
  }

  async *stream(): AsyncIterable<InteractiveAgentEvent> {
    const turn = this.turn;
    if (!turn) return;
    try {
      yield* turn.channel;
    } finally {
      // The consumer stopped reading mid-turn: stop the agent working too.
      if (this.turn === turn) void this.cancelTurn();
    }
  }

  async sendToolResult(): Promise<void> {
    throw new Error(
      `${this.profile.agentName} answers questions through onUserQuestion, not tool results`
    );
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    if (this.turn) {
      await this.cancelTurn();
      this.endTurn(null);
    }
    this.agentProcess.terminate();
    await this.agentProcess.waitForExit();
    this.connection.close();
  }

  abort(): void {
    this.agentProcess.terminate();
  }

  private async establish(resumeSessionId: string | undefined): Promise<void> {
    const { agent } = this.connection;
    await agent.request('initialize', {
      protocolVersion: PROTOCOL_VERSION,
      clientCapabilities: { fs: { readTextFile: false, writeTextFile: false }, terminal: false },
    });

    const request: NewSessionRequest = { cwd: this.options.cwd, mcpServers: [] };
    let configOptions: SessionConfigOption[] | null | undefined;
    if (resumeSessionId) {
      try {
        const loaded = await agent.request('session/load', {
          ...request,
          sessionId: resumeSessionId,
        });
        this.acpSessionId = resumeSessionId;
        configOptions = loaded.configOptions;
      } catch (error) {
        // A session the agent no longer has starts over, as a Claude resume
        // does; anything that would fail session/new too is not papered over.
        if (isAuthRequired(error) || this.agentProcess.deathError) throw error;
      }
    }
    if (!this.acpSessionId) {
      const created = await agent.request('session/new', request);
      this.acpSessionId = created.sessionId;
      configOptions = created.configOptions;
    }
    await this.applyModel(configOptions ?? []);
  }

  /** Select the requested model when the agent offers it; otherwise say so. */
  private async applyModel(configOptions: SessionConfigOption[]): Promise<void> {
    const requested = this.options.model;
    if (!requested) return;
    const wanted = this.profile.toAgentModel?.(requested) ?? requested;
    const choice = chooseModel(configOptions, wanted, this.profile.agentName);
    if (choice.kind === 'unavailable') this.notices.push(choice.notice);
    if (choice.kind !== 'set') return;
    try {
      await this.connection.agent.request('session/set_config_option', {
        sessionId: this.acpSessionId,
        configId: choice.configId,
        value: choice.value,
      });
    } catch (error) {
      // A model that cannot be selected is not worth losing the chat over.
      if (this.agentProcess.deathError) throw error;
      this.notices.push(
        `${this.profile.agentName} could not switch to model "${wanted}" ` +
          `(${describeRequestError(error)}) — using its default.`
      );
    }
  }

  private onSessionUpdate(notification: SessionNotification): void {
    const turn = this.turn;
    if (!turn || notification.sessionId !== this.acpSessionId) return;
    for (const event of this.translator.translate(notification.update)) turn.channel.push(event);
  }

  private finishTurn(turn: ActiveTurn, response: PromptResponse): void {
    if (this.turn !== turn) return;
    const failure = stopReasonFailure(this.profile.agentName, response.stopReason);
    if (failure) {
      this.endTurn({ type: 'error', content: failure });
      return;
    }
    this.endTurn({
      type: 'done',
      usage: {
        inputTokens: response.usage?.inputTokens,
        outputTokens: response.usage?.outputTokens,
        numTurns: 1,
        durationMs: Date.now() - turn.startedAt,
      },
    });
  }

  /** Flush pending output, emit the final event (if any) and close the turn. */
  private endTurn(final: InteractiveAgentEvent | null): void {
    const turn = this.turn;
    if (!turn) return;
    this.turn = null;
    for (const event of this.translator.flush()) turn.channel.push(event);
    if (final) turn.channel.push(final);
    turn.channel.close();
  }

  private async cancelTurn(): Promise<void> {
    if (this.agentProcess.deathError) return;
    try {
      await this.connection.agent.notify('session/cancel', { sessionId: this.acpSessionId });
    } catch {
      // The connection is going away; the process kill follows.
    }
  }

  private describe(error: unknown): string {
    if (isAuthRequired(error)) return this.profile.loginHint;
    return `${this.profile.agentName} failed to answer: ${describeRequestError(error)}`;
  }
}

/** Reject with `onTimeout()` if `work` has not settled within `ms`. */
async function withTimeout<T>(work: Promise<T>, ms: number, onTimeout: () => Error): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(onTimeout()), ms);
  });
  try {
    return await Promise.race([work, timeout]);
  } finally {
    clearTimeout(timer);
  }
}
