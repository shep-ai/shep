/** Storybook mock of app/actions/harness-commands (spec 119): succeeds without side effects. */
import type { HarnessResult } from '@/lib/harness-result';
import { fixtureSession, fixtureSetup } from '@/components/features/harness/harness-fixtures';

const ok = <T>(data: T): HarnessResult<T> => ({ ok: true, data });

export async function resolveHarnessPermission(req: { id: string }) {
  return ok({ id: req.id });
}
export async function includeHarnessChunk(_planId: string, _chunkId: string, _include: boolean) {
  return { ok: true as const, data: {} as never };
}
export async function startHarnessTask(_req: unknown) {
  return ok(fixtureSession);
}
export async function stopHarnessSession(_sessionId: string) {
  return ok(fixtureSession);
}
export async function applyHarnessSession(_sessionId: string, branch?: string) {
  return ok({
    branch: branch ?? 'harness/6f1c2d3e',
    commit: 'abcdef1234567890',
    files: ['src/auth/refresh.ts'],
  });
}
export async function promoteHarnessSession(_sessionId: string) {
  return ok({ featureId: 'feature-1' });
}
export async function discardHarnessSession(_sessionId: string) {
  return ok(fixtureSession);
}
export async function setUpHarnessRepository(_repoRoot: string, confirm: boolean) {
  return ok({ ...fixtureSetup, written: confirm ? fixtureSetup.files.map((f) => f.path) : [] });
}
