/**
 * Fake ACP agent for executor tests.
 *
 * A real Agent Client Protocol server (the SDK's `agent()` app) speaking
 * newline-delimited JSON over the stdio of a fake child process. Tests hand
 * `spawn` to an ACP executor and drive the agent's behaviour through
 * {@link FakeAcpAgentBehaviour}, so the executor's wire handling is exercised
 * end to end without spawning a binary.
 */

import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import {
  agent,
  ndJsonStream,
  RequestError,
  type AgentContext,
  type PromptResponse,
  type RequestPermissionResponse,
  type SessionConfigOption,
  type SessionUpdate,
} from '@agentclientprotocol/sdk';
import type { SpawnFunction } from '@/infrastructure/services/agents/common/types.js';

/** What the agent does when a prompt arrives. */
export type FakePromptHandler = (turn: {
  sessionId: string;
  text: string;
  /** Send a `session/update` notification for this session. */
  update: (update: SessionUpdate) => Promise<void>;
  /** The client connection, for permission and extension requests. */
  client: AgentContext;
  signal: AbortSignal;
}) => Promise<PromptResponse>;

export interface FakeAcpAgentBehaviour {
  /** Reply to session/new and session/load with "Authentication required". */
  authRequired?: boolean;
  /** Reply to session/new with this error (e.g. the backend rejected the account). */
  newSessionError?: RequestError;
  /** Reply to session/set_config_option with this error. */
  setConfigError?: Error;
  /** Config options advertised on session/new and session/load. */
  configOptions?: SessionConfigOption[];
  /** Sessions that session/load can restore, with the history it replays. */
  loadableSessions?: Record<string, SessionUpdate[]>;
  /** Defaults to echoing the prompt as one message chunk and ending the turn. */
  onPrompt?: FakePromptHandler;
}

/** Observable record of everything the client asked of the agent. */
export interface FakeAcpAgentRecord {
  initialize: unknown[];
  newSessions: { cwd: string }[];
  loads: string[];
  prompts: { sessionId: string; text: string }[];
  configSets: { configId: string; value: unknown }[];
  cancels: string[];
}

/** Minimal ChildProcess stand-in whose stdio is in-memory streams. */
export class FakeChildProcess extends EventEmitter {
  readonly stdin = new PassThrough();
  readonly stdout = new PassThrough();
  readonly stderr = new PassThrough();
  readonly pid: number;
  killed = false;
  exitCode: number | null = null;
  readonly killSignals: (NodeJS.Signals | number | undefined)[] = [];

  private static nextPid = 4000;

  constructor() {
    super();
    this.pid = FakeChildProcess.nextPid++;
  }

  kill(signal?: NodeJS.Signals | number): boolean {
    this.killSignals.push(signal);
    if (this.killed) return true;
    this.killed = true;
    this.exit(null, typeof signal === 'string' ? signal : 'SIGTERM');
    return true;
  }

  /**
   * Simulate the process exiting on its own (crash, OOM, clean exit).
   *
   * Follows Node's real ordering: stdout emits `end` BEFORE the process emits
   * `close`, so code that treats stdout's end as "the process is gone" is
   * caught here instead of only against a real binary.
   */
  exit(code: number | null, signal: NodeJS.Signals | null = null): void {
    if (this.exiting) return;
    this.exiting = true;
    setImmediate(() => {
      this.exitCode = code;
      const emitClose = (): void => {
        this.emit('exit', code, signal);
        this.emit('close', code, signal);
      };
      if (this.stdout.readableEnded) setImmediate(emitClose);
      else this.stdout.once('end', () => setImmediate(emitClose));
      this.stdout.end();
      this.stderr.end();
    });
  }

  private exiting = false;
}

/** Web WritableStream over a Node writable. */
function webWritable(stream: PassThrough): WritableStream<Uint8Array> {
  return new WritableStream<Uint8Array>({
    write: (chunk) =>
      new Promise<void>((resolve, reject) =>
        stream.write(chunk, (error) => (error ? reject(error) : resolve()))
      ),
  });
}

/** Web ReadableStream over a Node readable. */
function webReadable(stream: PassThrough): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      stream.on('data', (chunk: Buffer) => controller.enqueue(new Uint8Array(chunk)));
      stream.on('end', () => controller.close());
    },
  });
}

let sessionCounter = 0;

/**
 * Serve a fake ACP agent on `proc`'s stdio.
 *
 * @returns what the client asked for, so tests can assert on it
 */
export function serveFakeAcpAgent(
  proc: FakeChildProcess,
  behaviour: FakeAcpAgentBehaviour = {}
): FakeAcpAgentRecord {
  const record: FakeAcpAgentRecord = {
    initialize: [],
    newSessions: [],
    loads: [],
    prompts: [],
    configSets: [],
    cancels: [],
  };
  const configOptions = behaviour.configOptions ?? [];
  const known = new Set<string>();

  const requireAuth = (): void => {
    if (behaviour.authRequired) {
      throw RequestError.authRequired({ message: "Please run 'agent login' first." });
    }
  };

  const onPrompt: FakePromptHandler =
    behaviour.onPrompt ??
    (async ({ text, update }) => {
      await update({ sessionUpdate: 'agent_message_chunk', content: { type: 'text', text } });
      return { stopReason: 'end_turn' };
    });

  const app = agent({ name: 'fake-acp-agent' })
    .onRequest('initialize', ({ params }) => {
      record.initialize.push(params);
      return {
        protocolVersion: params.protocolVersion,
        agentCapabilities: { loadSession: true },
        authMethods: [],
      };
    })
    .onRequest('session/new', ({ params }) => {
      requireAuth();
      if (behaviour.newSessionError) throw behaviour.newSessionError;
      record.newSessions.push({ cwd: params.cwd });
      const sessionId = `fake-session-${++sessionCounter}`;
      known.add(sessionId);
      return { sessionId, configOptions };
    })
    .onRequest('session/load', async ({ params, client }) => {
      requireAuth();
      record.loads.push(params.sessionId);
      const history = behaviour.loadableSessions?.[params.sessionId];
      if (!history)
        throw RequestError.invalidParams({ message: `Session ${params.sessionId} not found` });
      known.add(params.sessionId);
      // ACP agents replay the conversation before answering session/load.
      for (const update of history) {
        await client.notify('session/update', { sessionId: params.sessionId, update });
      }
      return { configOptions };
    })
    .onRequest('session/set_config_option', ({ params }) => {
      record.configSets.push({ configId: params.configId, value: params.value });
      if (behaviour.setConfigError) throw behaviour.setConfigError;
      return { configOptions };
    })
    .onNotification('session/cancel', ({ params }) => {
      record.cancels.push(params.sessionId);
    })
    .onRequest('session/prompt', async ({ params, client, signal }) => {
      if (!known.has(params.sessionId))
        throw RequestError.invalidParams({ message: 'unknown session' });
      const text = params.prompt.map((block) => (block.type === 'text' ? block.text : '')).join('');
      record.prompts.push({ sessionId: params.sessionId, text });
      return onPrompt({
        sessionId: params.sessionId,
        text,
        client,
        signal,
        update: (update) =>
          client.notify('session/update', { sessionId: params.sessionId, update }),
      });
    });

  app.connect(ndJsonStream(webWritable(proc.stdout), webReadable(proc.stdin)));
  return record;
}

/** A spawn function that serves a fresh fake agent per spawn. */
export function fakeAcpSpawn(behaviour: FakeAcpAgentBehaviour = {}): {
  spawn: SpawnFunction & { mock: { calls: unknown[][] } };
  processes: FakeChildProcess[];
  records: FakeAcpAgentRecord[];
} {
  const processes: FakeChildProcess[] = [];
  const records: FakeAcpAgentRecord[] = [];
  const calls: unknown[][] = [];
  const spawn = ((command: string, args: string[], options?: object) => {
    calls.push([command, args, options]);
    const proc = new FakeChildProcess();
    processes.push(proc);
    records.push(serveFakeAcpAgent(proc, behaviour));
    return proc;
  }) as unknown as SpawnFunction & { mock: { calls: unknown[][] } };
  spawn.mock = { calls };
  return { spawn, processes, records };
}

/** Pick the option a permission response selected, or null when cancelled. */
export function selectedOption(response: RequestPermissionResponse): string | null {
  return response.outcome.outcome === 'selected' ? response.outcome.optionId : null;
}
