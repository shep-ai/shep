/** Storybook mock of app/actions/harness-queries (spec 119): fixture data, no DI. */
import type { ChunkVisibility } from '@shepai/core/domain/generated/output';
import type { HarnessResult } from '@/lib/harness-result';
import {
  fixtureCapabilities,
  fixtureChunkView,
  fixtureExplanation,
  fixturePermissionItem,
  fixturePlan,
  fixturePolicies,
  fixtureSessionDetail,
  fixtureSessionList,
} from '@/components/features/harness/harness-fixtures';

const ok = <T>(data: T): HarnessResult<T> => ({ ok: true, data });

export async function listHarnessSessions(_featureId?: string) {
  return ok(fixtureSessionList);
}
export async function getHarnessSession(_id: string) {
  return ok(fixtureSessionDetail);
}
export async function getHarnessSessionForFeature(_featureId: string) {
  return ok(fixtureSessionDetail);
}
export async function getHarnessContextPlan(_planId: string) {
  return ok({
    plan: fixturePlan,
    summary: { ...fixtureSessionDetail.tasks[0].plans[2] },
  });
}
export async function renderHarnessChunk(_chunkId: string, visibility: ChunkVisibility) {
  return ok({ ...fixtureChunkView, visibility });
}
export async function explainHarnessDecision(_input: unknown) {
  return ok(fixtureExplanation);
}
export async function listHarnessPermissions(_input: unknown = {}) {
  return ok([fixturePermissionItem]);
}
export async function listHarnessCapabilities() {
  return ok(fixtureCapabilities);
}
export async function getHarnessPolicies(_repoRoot: string) {
  return ok(fixturePolicies);
}
export async function listHarnessRepositoryPaths() {
  return ok(['/home/dev/acme-api', '/home/dev/acme-web']);
}
