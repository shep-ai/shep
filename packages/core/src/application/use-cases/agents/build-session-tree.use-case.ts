/**
 * Build Session Tree Use Case
 *
 * Assembles the Control Center's session tree: Repository → features →
 * sessions, with adopted sessions nested under the feature they became and
 * unadopted sessions collected in a per-repository bucket.
 *
 * Business Rules:
 * - A session is ADOPTED iff some feature's `sourceAgentSessionId` equals its
 *   id. That map is built while walking the feature list this use case already
 *   needs, so no per-session repository query is issued.
 * - Archived sessions are excluded unless explicitly requested. Archive state
 *   lives in a sparse marker table, never on the session itself.
 * - The result is a ready-to-render view model. Presentation does no joining,
 *   no bucketing, and no adopted/unadopted determination of its own.
 */

import { injectable, inject } from 'tsyringe';
import type { AgentSession, Feature } from '../../../domain/generated/output.js';
import type { IArchivedSessionRepository } from '../../ports/output/repositories/archived-session.repository.interface.js';
import { ListRepositoriesUseCase } from '../repositories/list-repositories.use-case.js';
import { ListFeaturesUseCase } from '../features/list-features.use-case.js';
import { ListSessionsForPathsUseCase } from './list-sessions-for-paths.use-case.js';

/** Sessions shown per repository in the tree. */
const SESSIONS_PER_PATH = 25;

export interface SessionTreeSession {
  id: string;
  agentType: string;
  preview?: string;
  messageCount: number;
  lastMessageAt?: string;
  /** Absolute transcript path — needed to name the file in the delete confirm */
  filePath?: string;
  /** True when a feature was adopted from this session */
  adopted: boolean;
  /** True when the user has archived this session */
  archived: boolean;
}

export interface SessionTreeFeature {
  id: string;
  name: string;
  lifecycle: string;
  /** Sessions this feature was adopted from (usually one) */
  sessions: SessionTreeSession[];
}

export interface SessionTreeRepository {
  id?: string;
  name: string;
  path: string;
  features: SessionTreeFeature[];
  /** Sessions in this repository that no feature was adopted from */
  unadoptedSessions: SessionTreeSession[];
  /** Total sessions shown for this repository, adopted and unadopted */
  sessionCount: number;
}

export interface BuildSessionTreeInput {
  /** Include archived sessions in the result (default false) */
  includeArchived?: boolean;
}

export interface BuildSessionTreeResult {
  repositories: SessionTreeRepository[];
  /** Number of archived sessions hidden from this result */
  archivedCount: number;
}

@injectable()
export class BuildSessionTreeUseCase {
  constructor(
    @inject(ListRepositoriesUseCase)
    private readonly listRepositories: ListRepositoriesUseCase,
    @inject(ListFeaturesUseCase)
    private readonly listFeatures: ListFeaturesUseCase,
    @inject(ListSessionsForPathsUseCase)
    private readonly listSessions: ListSessionsForPathsUseCase,
    @inject('IArchivedSessionRepository')
    private readonly archived: IArchivedSessionRepository
  ) {}

  async execute(input?: BuildSessionTreeInput): Promise<BuildSessionTreeResult> {
    const includeArchived = input?.includeArchived ?? false;

    const [repositories, features, archivedByAgent] = await Promise.all([
      this.listRepositories.execute(),
      this.listFeatures.execute({ includeArchived: false }),
      this.archived.listAllArchivedIds(),
    ]);

    const { sessionsByPath } = await this.listSessions.execute({
      specs: repositories
        .filter((repo) => Boolean(repo.path))
        .map((repo) => ({ path: repo.path, includeWorktrees: true })),
      limitPerPath: SESSIONS_PER_PATH,
    });

    // One pass over the features we already loaded gives the adopted map —
    // no per-session repository lookup.
    const adoptedBySessionId = this.buildAdoptedMap(features);

    let archivedCount = 0;
    const treeRepositories: SessionTreeRepository[] = [];

    for (const repo of repositories) {
      if (!repo.path) continue;

      const repoFeatures = features.filter((f) => f.repositoryPath === repo.path);
      const sessions = sessionsByPath[repo.path] ?? [];

      const featureNodes = new Map<string, SessionTreeFeature>(
        repoFeatures.map((f) => [
          f.id,
          { id: f.id, name: f.name, lifecycle: f.lifecycle, sessions: [] },
        ])
      );
      const unadoptedSessions: SessionTreeSession[] = [];

      for (const session of sessions) {
        const isArchived = this.isArchived(archivedByAgent, session);
        if (isArchived) {
          archivedCount++;
          if (!includeArchived) continue;
        }

        const node = this.toTreeSession(session, adoptedBySessionId.has(session.id), isArchived);
        const adoptedByFeatureId = adoptedBySessionId.get(session.id);

        // An adopted session nests under its feature — but only if that feature
        // belongs to this repository; otherwise it stays a loose session here.
        const featureNode =
          adoptedByFeatureId !== undefined ? featureNodes.get(adoptedByFeatureId) : undefined;

        if (featureNode) {
          featureNode.sessions.push(node);
        } else {
          unadoptedSessions.push(node);
        }
      }

      const featureList = [...featureNodes.values()];
      treeRepositories.push({
        ...(repo.id !== undefined && { id: repo.id }),
        name: repo.name,
        path: repo.path,
        features: featureList,
        unadoptedSessions,
        sessionCount:
          unadoptedSessions.length + featureList.reduce((sum, f) => sum + f.sessions.length, 0),
      });
    }

    return { repositories: treeRepositories, archivedCount };
  }

  /** sessionId → featureId, from the features already loaded. */
  private buildAdoptedMap(features: Feature[]): Map<string, string> {
    const map = new Map<string, string>();
    for (const feature of features) {
      if (feature.sourceAgentSessionId) {
        map.set(feature.sourceAgentSessionId, feature.id);
      }
    }
    return map;
  }

  private isArchived(archivedByAgent: Map<string, Set<string>>, session: AgentSession): boolean {
    return archivedByAgent.get(String(session.agentType))?.has(session.id) ?? false;
  }

  private toTreeSession(
    session: AgentSession,
    adopted: boolean,
    archived: boolean
  ): SessionTreeSession {
    return {
      id: session.id,
      agentType: String(session.agentType),
      ...(session.preview !== undefined && { preview: session.preview }),
      messageCount: session.messageCount,
      ...(session.lastMessageAt !== undefined && {
        lastMessageAt: new Date(session.lastMessageAt).toISOString(),
      }),
      ...(session.filePath !== undefined && { filePath: session.filePath }),
      adopted,
      archived,
    };
  }
}
