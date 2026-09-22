/**
 * Per-connection polling of the spec 093 collaboration streams — agent
 * messages, agent questions and supervisor decisions — for every known
 * application scope.
 *
 * Replay rule (spec 116, task 10): every SSE (re)connect starts with empty
 * caches, so a naive first poll reports the scope's entire history as `new`.
 * Instead, the first successful fetch for a scope that already existed when
 * the connection opened only SEEDS the cache — the same posture the feature
 * cache takes in `seedFeatureCache`. Later fetches emit deltas. A scope that
 * first appears after the connection opened has no history the client could
 * already hold, so its rows are emitted from the start.
 *
 * Questions are the one exception to "seed silently": a question that is still
 * PENDING is open state, not history — the sidebar badge and the inbox need it
 * on every connect. So the seeding fetch still emits the pending ones. The
 * client upserts by id, so re-sending them on a reconnect is idempotent.
 *
 * A cache is only created once a fetch succeeded: a failed first fetch must
 * not leave an empty cache behind that the next tick would treat as "nothing
 * seen yet" and replay everything.
 */

import {
  AgentQuestionStatus,
  type AgentMessage,
  type AgentQuestion,
  type SupervisorDecision,
} from '../../../../domain/generated/output.js';

import {
  computeDecisionDeltas,
  type CachedSupervisorDecisionState,
} from './compute-decision-deltas.js';
import { computeMessageDeltas, type CachedAgentMessageState } from './compute-message-deltas.js';
import { computeQuestionDeltas, type CachedAgentQuestionState } from './compute-question-deltas.js';
import type { StreamedAgentEvent } from './stream-agent-events.types.js';

/** Connection-scoped state for the three collaboration streams. */
export interface CollaborationStreamState {
  messages: Map<string, CachedAgentMessageState>;
  questions: Map<string, CachedAgentQuestionState>;
  decisions: Map<string, CachedSupervisorDecisionState>;
  /**
   * Application ids from the connection's first successful listing — the
   * scopes whose existing rows are history. `null` until that listing.
   */
  historicScopes: Set<string> | null;
}

/** Repository reads the poller needs, bound by the use case. */
export interface CollaborationSources {
  listMessages(appId: string, since: Date | undefined): Promise<AgentMessage[]>;
  listQuestions(appId: string): Promise<AgentQuestion[]>;
  listDecisions(appId: string, since: Date | undefined): Promise<SupervisorDecision[]>;
}

export function createCollaborationStreamState(): CollaborationStreamState {
  return { messages: new Map(), questions: new Map(), decisions: new Map(), historicScopes: null };
}

function isPendingQuestionEvent(event: StreamedAgentEvent): boolean {
  return event.kind === 'agent_question' && event.status === AgentQuestionStatus.pending;
}

function sinceCursor(lastSeenAt: number | undefined): Date | undefined {
  return lastSeenAt !== undefined && lastSeenAt > 0 ? new Date(lastSeenAt) : undefined;
}

/**
 * Fetch one scope's rows and diff them against its cache. On the scope's
 * first successful fetch the cache is created and, when `seedSilently`, the
 * computed events are discarded — the cache still records every row.
 * Fetch failures are swallowed (same posture as the other poll sections).
 */
async function pollScope<Row, Cache>(args: {
  caches: Map<string, Cache>;
  appId: string;
  seedSilently: boolean;
  fetch: (cache: Cache | undefined) => Promise<Row[]>;
  createCache: () => Cache;
  compute: (rows: Row[], cache: Cache) => StreamedAgentEvent[];
  /** Events a silent seed must still emit because they are open state. */
  keepOnSeed?: (event: StreamedAgentEvent) => boolean;
}): Promise<StreamedAgentEvent[]> {
  const existing = args.caches.get(args.appId);
  let rows: Row[];
  try {
    rows = await args.fetch(existing);
  } catch {
    return [];
  }
  const cache = existing ?? args.createCache();
  const events = args.compute(rows, cache);
  if (existing) return events;
  args.caches.set(args.appId, cache);
  if (!args.seedSilently) return events;
  return args.keepOnSeed ? events.filter(args.keepOnSeed) : [];
}

/**
 * Poll every collaboration stream for each application id and return the
 * events to emit. `appIds` must come from a SUCCESSFUL application listing.
 */
export async function pollCollaborationDeltas(args: {
  appIds: readonly string[];
  state: CollaborationStreamState;
  sources: CollaborationSources;
}): Promise<StreamedAgentEvent[]> {
  const { appIds, state, sources } = args;
  state.historicScopes ??= new Set(appIds);
  const historic = state.historicScopes;
  const events: StreamedAgentEvent[] = [];

  for (const appId of appIds) {
    const seedSilently = historic.has(appId);

    events.push(
      ...(await pollScope({
        caches: state.messages,
        appId,
        seedSilently,
        fetch: (cache) => sources.listMessages(appId, sinceCursor(cache?.lastSeenAt)),
        createCache: (): CachedAgentMessageState => ({ lastSeenAt: 0, deliveredIds: new Set() }),
        compute: (messages, cache) => computeMessageDeltas({ messages, cache }),
      })),
      ...(await pollScope({
        caches: state.questions,
        appId,
        seedSilently,
        fetch: () => sources.listQuestions(appId),
        createCache: (): CachedAgentQuestionState => ({ lastSeenAt: 0, lastStatus: new Map() }),
        compute: (questions, cache) => computeQuestionDeltas({ questions, cache }),
        keepOnSeed: isPendingQuestionEvent,
      })),
      ...(await pollScope({
        caches: state.decisions,
        appId,
        seedSilently,
        fetch: (cache) => sources.listDecisions(appId, sinceCursor(cache?.lastSeenAt)),
        createCache: (): CachedSupervisorDecisionState => ({
          lastSeenAt: 0,
          deliveredIds: new Set(),
        }),
        compute: (decisions, cache) => computeDecisionDeltas({ decisions, cache }),
      }))
    );
  }

  return events;
}
