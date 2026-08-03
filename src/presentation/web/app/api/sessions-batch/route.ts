import { NextResponse } from 'next/server';
import { resolve } from '@/lib/server-container';
import type { ListRepositoriesUseCase } from '@shepai/core/application/use-cases/repositories/list-repositories.use-case';
import type { ListFeaturesUseCase } from '@shepai/core/application/use-cases/features/list-features.use-case';
import type {
  ListSessionsForPathsUseCase,
  SessionPathSpec,
} from '@shepai/core/application/use-cases/agents/list-sessions-for-paths.use-case';

export const dynamic = 'force-dynamic';

const SESSIONS_PER_PATH = 5;

/**
 * GET /api/sessions-batch
 *
 * Resolves every tracked repository and active feature, then returns
 * { sessionsByPath } for the canvas.
 *
 * Thin adapter: provider fan-out, merging, per-path limiting, and the
 * short-lived cache all live in ListSessionsForPathsUseCase. Repository paths
 * request worktree inclusion; a feature's own worktree path does not, since
 * that would double-count the same transcripts.
 */
export async function GET() {
  try {
    const listRepos = resolve<ListRepositoriesUseCase>('ListRepositoriesUseCase');
    const listFeatures = resolve<ListFeaturesUseCase>('ListFeaturesUseCase');
    const listSessions = resolve<ListSessionsForPathsUseCase>('ListSessionsForPathsUseCase');

    const [repositories, features] = await Promise.all([
      listRepos.execute(),
      listFeatures.execute({ includeArchived: false }),
    ]);

    const specs: SessionPathSpec[] = [];

    for (const repo of repositories) {
      if (repo.path) specs.push({ path: repo.path, includeWorktrees: true });
    }

    for (const feature of features) {
      const sessionPath = feature.worktreePath ?? feature.repositoryPath;
      if (sessionPath) specs.push({ path: sessionPath, includeWorktrees: false });
    }

    const { sessionsByPath } = await listSessions.execute({
      specs,
      limitPerPath: SESSIONS_PER_PATH,
    });

    return NextResponse.json({ sessionsByPath });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[API] GET /api/sessions-batch error:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
