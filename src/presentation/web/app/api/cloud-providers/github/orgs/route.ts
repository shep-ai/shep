/**
 * GET /api/cloud-providers/github/orgs
 *
 * Returns the list of "owners" the authenticated GitHub user can publish a
 * repository under: their personal account plus every organization they
 * belong to. The first entry is always the personal account so the UI can
 * default to it. Returns 401 when gh is not signed in so the caller can
 * route the user to the sign-in flow.
 */

import { NextResponse } from 'next/server';
import { resolve } from '@/lib/server-container';
import type { ListGitHubOrganizationsUseCase } from '@shepai/core/application/use-cases/repositories/list-github-organizations.use-case';
import type { IGitHubRepositoryService } from '@shepai/core/application/ports/output/services/github-repository-service.interface';

export const dynamic = 'force-dynamic';

interface Owner {
  login: string;
  kind: 'user' | 'org';
  description: string;
}

export async function GET(): Promise<NextResponse> {
  try {
    const github = resolve<IGitHubRepositoryService>('IGitHubRepositoryService');
    let user: string;
    try {
      user = await github.getAuthenticatedUser();
    } catch {
      return NextResponse.json(
        { error: 'GitHub CLI is not authenticated', code: 'GH_NOT_AUTHENTICATED' },
        { status: 401 }
      );
    }

    const listOrgs = resolve<ListGitHubOrganizationsUseCase>('ListGitHubOrganizationsUseCase');
    const orgs = await listOrgs.execute();

    const owners: Owner[] = [
      { login: user, kind: 'user', description: 'Your personal account' },
      ...orgs.map((o) => ({ login: o.login, kind: 'org' as const, description: o.description })),
    ];

    return NextResponse.json({ owners });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
