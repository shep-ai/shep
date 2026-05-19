import type {
  BedrockMemorySnapshot,
  BedrockTargetKind,
} from '@shepai/core/domain/generated/output';

export type BedrockActionResult = { ok: true } | { ok: false; code: string; remediation: string };

export type BedrockLifecycleResult =
  | { ok: true; stdout: string }
  | { ok: false; code: string; remediation: string };

export async function enableBedrockForTarget(
  _kind: BedrockTargetKind,
  _id: string
): Promise<BedrockActionResult> {
  return { ok: true };
}

export async function syncBedrockForTarget(
  _kind: BedrockTargetKind,
  _id: string
): Promise<BedrockLifecycleResult> {
  return { ok: true, stdout: '' };
}

export async function shipBedrockForTarget(
  _kind: BedrockTargetKind,
  _id: string
): Promise<BedrockLifecycleResult> {
  return { ok: true, stdout: '' };
}

export async function getBedrockMemorySnapshot(
  _kind: BedrockTargetKind,
  _id: string
): Promise<BedrockMemorySnapshot | null> {
  return null;
}
