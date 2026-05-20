'use server';

/**
 * loadCuratedIssues — server action backing the LaneChooser ↔ CuratedIssuesList
 * interaction on the contributor onboarding view (spec 097, task-47). Resolves
 * GetCuratedIssuesByLaneUseCase from the DI container and returns the curated
 * list, or `{ error }` when the use case throws. No API route is needed in v1.
 */

import { resolve } from '@/lib/server-container';
import { GetContributorOnboardingConfig } from './shared/contributor-onboarding-config';
import type { GetCuratedIssuesByLaneUseCase } from '@shepai/core/application/use-cases/contributors/get-curated-issues-by-lane.use-case';
import type { ContributorLane } from '@shepai/core/domain/generated/output';
import type { CuratedIssueView } from '@/components/contributors/CuratedIssuesList';

export interface LoadCuratedIssuesResult {
  issues?: readonly CuratedIssueView[];
  error?: string;
}

export async function loadCuratedIssues(lane: ContributorLane): Promise<LoadCuratedIssuesResult> {
  try {
    const { owner, repo } = GetContributorOnboardingConfig();
    const useCase = resolve<GetCuratedIssuesByLaneUseCase>('GetCuratedIssuesByLaneUseCase');
    const result = await useCase.execute({ owner, repo, lane });
    return { issues: result.issues };
  } catch (error: unknown) {
    return { error: error instanceof Error ? error.message : 'Failed to load curated issues' };
  }
}
