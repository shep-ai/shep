/**
 * List Sessions For Paths Use Case
 *
 * Returns a path-keyed map of recent agent sessions for a set of project paths,
 * merged across every supported provider.
 *
 * This orchestration previously lived inside the /api/sessions-batch route
 * (build path specs, fan out, merge by recency, cap per path, cache) — all of
 * which is business logic, so it belongs in a use case. The route is now a thin
 * adapter over this.
 *
 * Performance note: the canvas polls this every 30 seconds for every repository
 * on screen, so results are cached briefly and providers keep their own
 * stat-then-parse-top-N strategy rather than parsing every transcript.
 */

import { injectable, inject } from 'tsyringe';
import type { AgentSession, AgentType } from '../../../domain/generated/output.js';
import { normalizePath } from '../../../domain/shared/normalize-path.js';
import type { IAgentSessionRepositoryRegistry } from '../../ports/output/agents/agent-session-repository-registry.interface.js';
import type { IClock } from '../../ports/output/services/clock.interface.js';

/** Providers queried for sessions. Unsupported ones return nothing and are skipped. */
const SESSION_PROVIDERS: AgentType[] = [
  'claude-code' as AgentType,
  'codex-cli' as AgentType,
  'cursor' as AgentType,
];

/** Default number of sessions returned per path. */
const DEFAULT_SESSIONS_PER_PATH = 5;

/** How long a batch result stays fresh. Matches the canvas poll interval. */
const CACHE_TTL_MS = 30_000;

export interface SessionPathSpec {
  /** Absolute project path to look up */
  path: string;
  /**
   * Whether to include sessions recorded in worktrees of this path. True for
   * repository paths (whose features live in worktrees); false for a path that
   * already IS a worktree, which would otherwise double-count.
   */
  includeWorktrees?: boolean;
}

export interface ListSessionsForPathsInput {
  specs: SessionPathSpec[];
  /** Max sessions per path (default 5) */
  limitPerPath?: number;
  /** Bypass the short-lived cache */
  forceRefresh?: boolean;
}

export interface ListSessionsForPathsResult {
  /** Sessions keyed by the requested path */
  sessionsByPath: Record<string, AgentSession[]>;
}

@injectable()
export class ListSessionsForPathsUseCase {
  private cache: { key: string; data: Record<string, AgentSession[]>; createdAt: number } | null =
    null;

  constructor(
    @inject('IAgentSessionRepositoryRegistry')
    private readonly registry: IAgentSessionRepositoryRegistry,
    @inject('IClock')
    private readonly clock: IClock
  ) {}

  async execute(input: ListSessionsForPathsInput): Promise<ListSessionsForPathsResult> {
    const limitPerPath = input.limitPerPath ?? DEFAULT_SESSIONS_PER_PATH;
    const specs = this.dedupe(input.specs);

    if (specs.length === 0) return { sessionsByPath: {} };

    const cacheKey = this.cacheKey(specs, limitPerPath);
    const now = this.clock.now().getTime();

    if (
      !input.forceRefresh &&
      this.cache !== null &&
      this.cache.key === cacheKey &&
      now - this.cache.createdAt < CACHE_TTL_MS
    ) {
      return { sessionsByPath: this.cache.data };
    }

    const entries = await Promise.all(
      specs.map(async (spec) => [spec.path, await this.forPath(spec, limitPerPath)] as const)
    );

    const sessionsByPath: Record<string, AgentSession[]> = {};
    for (const [path, sessions] of entries) {
      sessionsByPath[path] = sessions;
    }

    this.cache = { key: cacheKey, data: sessionsByPath, createdAt: now };
    return { sessionsByPath };
  }

  /** Query every supported provider for one path and merge by recency. */
  private async forPath(spec: SessionPathSpec, limitPerPath: number): Promise<AgentSession[]> {
    const perProvider = await Promise.all(
      SESSION_PROVIDERS.map(async (agentType) => {
        const repository = this.registry.getRepository(agentType);
        // Unsupported providers contribute nothing — and must not warn per
        // path, or a canvas poll would emit one warning per repo per provider.
        if (!repository.isSupported()) return [];

        try {
          return await repository.list({
            projectPath: spec.path,
            limit: limitPerPath,
            includeWorktrees: spec.includeWorktrees ?? false,
          });
        } catch {
          // One failing provider must not blank out the others.
          return [];
        }
      })
    );

    return perProvider
      .flat()
      .sort((a, b) => this.recencyOf(b) - this.recencyOf(a))
      .slice(0, limitPerPath);
  }

  private recencyOf(session: AgentSession): number {
    const stamp = session.lastMessageAt ?? session.updatedAt;
    return stamp instanceof Date ? stamp.getTime() : new Date(stamp).getTime();
  }

  /** Collapse duplicate paths, keeping the widest worktree setting. */
  private dedupe(specs: SessionPathSpec[]): SessionPathSpec[] {
    const byPath = new Map<string, SessionPathSpec>();

    for (const spec of specs) {
      const path = normalizePath(spec.path);
      if (path === '') continue;

      const existing = byPath.get(path);
      byPath.set(path, {
        path,
        includeWorktrees: (existing?.includeWorktrees ?? false) || (spec.includeWorktrees ?? false),
      });
    }

    return [...byPath.values()];
  }

  private cacheKey(specs: SessionPathSpec[], limitPerPath: number): string {
    return `${limitPerPath}|${specs
      .map((s) => `${s.path}:${s.includeWorktrees ? 1 : 0}`)
      .sort()
      .join(',')}`;
  }
}
