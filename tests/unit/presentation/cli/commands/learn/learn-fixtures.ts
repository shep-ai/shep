/**
 * Shared fixtures for the `shep learn` command tests (spec 150).
 */

import { resolve } from 'node:path';
import { vi, type Mock } from 'vitest';
import {
  HarnessComponentKind,
  HarnessEditDimension,
  HarnessEditVerdict,
  HarnessOrigin,
  HarnessVersionTrend,
  LearnedHarnessStatus,
  MemoryScope,
  type HarnessEditRecord,
  type LearnedHarnessVersion,
} from '@/domain/generated/output.js';
import type { HarnessVersionEntry } from '@/application/use-cases/harness-learning/list-harness-history.use-case.js';

export const T = new Date('2026-10-01T10:00:00Z');
/** Absolute on every platform, so `--repo REPO` resolves to itself. */
export const REPO = resolve('/work/acme');

export const ADOPTED_ID = 'aaaaaaaa-1111-4111-8111-111111111111';
export const CANDIDATE_ID = 'bbbbbbbb-2222-4222-8222-222222222222';

export function version(overrides: Partial<LearnedHarnessVersion> = {}): LearnedHarnessVersion {
  return {
    id: ADOPTED_ID,
    scope: MemoryScope.Project,
    repositoryPath: REPO,
    status: LearnedHarnessStatus.Adopted,
    origin: HarnessOrigin.Reflect,
    components: [
      {
        kind: HarnessComponentKind.Skill,
        path: 'skills/run-migrations/SKILL.md',
        content: '---\nname: run-migrations\n---\nRun pnpm db:migrate first.',
        sha256: 'abc',
      },
      {
        kind: HarnessComponentKind.Instructions,
        path: 'instructions.md',
        content: 'Use the run-migrations skill before touching the schema.',
        sha256: 'def',
      },
    ],
    createdAt: T,
    updatedAt: T,
    ...overrides,
  };
}

export const EDIT: HarnessEditRecord = {
  id: 'edit-1',
  versionId: CANDIDATE_ID,
  refinementRunId: 'run-1',
  dimension: HarnessEditDimension.Inv,
  componentPath: 'skills/run-migrations/SKILL.md',
  change: 'Added a migration skill',
  observed: 'CI-fix attempts dropped from 3 to 0',
  verdict: HarnessEditVerdict.Helped,
  createdAt: T,
  updatedAt: T,
};

const METRICS = {
  count: 6,
  mergeRate: 0.5,
  meanCiFixAttempts: 1.5,
  meanGateRejections: 0,
  meanValidationRepairs: 0,
  meanNumTurns: 40,
  meanCostUsd: 2,
};

export function entry(
  v: LearnedHarnessVersion,
  trend: HarnessVersionTrend = HarnessVersionTrend.InsufficientData
): HarnessVersionEntry {
  return { version: v, metrics: METRICS, trend, relativeChange: 0, edits: [] };
}

type LearnUseCaseName =
  | 'GetCurrentHarnessUseCase'
  | 'ListHarnessHistoryUseCase'
  | 'GetHarnessVersionUseCase'
  | 'AdoptHarnessVersionUseCase'
  | 'ImportHarnessVersionUseCase'
  | 'RejectHarnessVersionUseCase'
  | 'RollbackHarnessVersionUseCase'
  | 'ReflectOnFeatureUseCase';

export type FakeUseCases = Record<LearnUseCaseName, { execute: Mock }>;

/** The fake use cases a learn command may resolve, keyed by class name. */
export function createFakeUseCases(): FakeUseCases {
  return {
    GetCurrentHarnessUseCase: { execute: vi.fn() },
    ListHarnessHistoryUseCase: { execute: vi.fn() },
    GetHarnessVersionUseCase: { execute: vi.fn() },
    AdoptHarnessVersionUseCase: { execute: vi.fn() },
    ImportHarnessVersionUseCase: { execute: vi.fn() },
    RejectHarnessVersionUseCase: { execute: vi.fn() },
    RollbackHarnessVersionUseCase: { execute: vi.fn() },
    ReflectOnFeatureUseCase: { execute: vi.fn() },
  };
}

/** Resolve a token (class or string) against the fakes; anything else is a test bug. */
export function resolveFake(fakes: FakeUseCases, token: unknown): unknown {
  const name = typeof token === 'function' ? token.name : String(token);
  if (name in fakes) return fakes[name as keyof FakeUseCases];
  throw new Error(`unexpected token ${name}`);
}

/** Everything the command printed to stdout and stderr. */
export function printed(): string {
  return [
    ...vi.mocked(console.log).mock.calls.flat(),
    ...vi.mocked(console.error).mock.calls.flat(),
  ].join('\n');
}
