'use server';

/**
 * Server actions for the Spaces page (spec 120). Each one calls a single use
 * case and returns its result as-is; a thrown error becomes a failed result so
 * the page can show it next to the control that caused it.
 */

import { resolve } from '@/lib/server-container';
import type {
  CreateSpaceInput,
  ManageSpacesUseCase,
  ProductLineInput,
  UpdateSpaceInput,
} from '@shepai/core/application/use-cases/spaces/manage-spaces.use-case';
import type {
  AddSpaceRuleInput,
  AssignRepositoryInput,
  ManageSpaceMembershipUseCase,
} from '@shepai/core/application/use-cases/spaces/manage-space-membership.use-case';
import type {
  GetSpacesOverviewUseCase,
  SpacesOverview,
} from '@shepai/core/application/use-cases/spaces/get-spaces-overview.use-case';
import type { SpaceResult } from '@shepai/core/application/use-cases/spaces/space-refs';

const spaces = () => resolve<ManageSpacesUseCase>('ManageSpacesUseCase');
const membership = () => resolve<ManageSpaceMembershipUseCase>('ManageSpaceMembershipUseCase');

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function attempt<T extends object>(
  body: () => Promise<SpaceResult<T>>
): Promise<SpaceResult<T>> {
  try {
    return await body();
  } catch (error: unknown) {
    return { ok: false, error: message(error) };
  }
}

export async function getSpacesOverview(): Promise<{ overview?: SpacesOverview; error?: string }> {
  try {
    const overview = await resolve<GetSpacesOverviewUseCase>('GetSpacesOverviewUseCase').execute();
    return { overview };
  } catch (error: unknown) {
    return { error: message(error) };
  }
}

export async function createSpace(input: CreateSpaceInput) {
  return attempt(() => spaces().create(input));
}

export async function updateSpace(ref: string, input: UpdateSpaceInput) {
  return attempt(() => spaces().update(ref, input));
}

export async function setDefaultSpace(ref: string) {
  return attempt(() => spaces().setDefault(ref));
}

export async function deleteSpace(ref: string) {
  return attempt(() => spaces().delete(ref));
}

export async function createProductLine(spaceRef: string, input: ProductLineInput) {
  return attempt(() => spaces().createProductLine(spaceRef, input));
}

export async function deleteProductLine(spaceRef: string, lineRef: string) {
  return attempt(() => spaces().deleteProductLine(spaceRef, lineRef));
}

export async function addSpaceRule(input: AddSpaceRuleInput) {
  return attempt(() => membership().addRule(input));
}

export async function removeSpaceRule(id: string) {
  return attempt(() => membership().removeRule(id));
}

export async function assignRepository(input: AssignRepositoryInput) {
  return attempt(() => membership().assign(input));
}

export async function unassignRepository(repositoryPath: string) {
  return attempt(() => membership().unassign(repositoryPath));
}
