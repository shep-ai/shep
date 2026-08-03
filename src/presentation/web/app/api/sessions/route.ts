import { NextResponse } from 'next/server';
import { resolve } from '@/lib/server-container';
import type { ListSessionsForPathsUseCase } from '@shepai/core/application/use-cases/agents/list-sessions-for-paths.use-case';

export const dynamic = 'force-dynamic';

const DEFAULT_LIMIT = 10;

/**
 * GET /api/sessions?repositoryPath=<path>&limit=<n>&includeWorktrees=<bool>
 *
 * Returns agent sessions from all supported providers (Claude Code, Codex CLI,
 * Cursor) for one repository path, merged and sorted by recency.
 *
 * Thin adapter — discovery, provider fan-out, merging, and limiting all live in
 * ListSessionsForPathsUseCase.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const repositoryPath = url.searchParams.get('repositoryPath');
  const parsedLimit = Number.parseInt(url.searchParams.get('limit') ?? '', 10);
  const limit = Number.isNaN(parsedLimit) ? DEFAULT_LIMIT : parsedLimit;
  const includeWorktrees = url.searchParams.get('includeWorktrees') === 'true';

  if (!repositoryPath?.trim()) {
    return NextResponse.json({ error: 'repositoryPath is required' }, { status: 400 });
  }

  try {
    const useCase = resolve<ListSessionsForPathsUseCase>('ListSessionsForPathsUseCase');
    const { sessionsByPath } = await useCase.execute({
      specs: [{ path: repositoryPath, includeWorktrees }],
      limitPerPath: limit,
    });

    // The use case keys by normalized path, so read the single entry rather
    // than indexing with the raw query value.
    const sessions = Object.values(sessionsByPath)[0] ?? [];

    return NextResponse.json({ sessions });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[API] GET /api/sessions error:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
