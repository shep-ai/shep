import 'reflect-metadata';
import { describe, it, expect, vi } from 'vitest';
import { SpaceResolutionSource, type Space } from '@/domain/generated/output.js';
import { CheckDocsGateUseCase } from '@/application/use-cases/docs-first/check-docs-gate.use-case.js';
import type { ResolveSpaceContextUseCase } from '@/application/use-cases/spaces/resolve-space-context.use-case.js';
import { DEFAULT_SPACE } from '../../../../helpers/space-repositories.mock.js';
import type { ISettingsRepository } from '@/application/ports/output/repositories/settings.repository.interface.js';
import { createDefaultSettings } from '@/domain/factories/settings-defaults.factory.js';

function settingsWith(docsFirst: boolean): ISettingsRepository {
  const settings = createDefaultSettings();
  settings.featureFlags = { ...settings.featureFlags!, docsFirst };
  return { initialize: vi.fn(), update: vi.fn(), load: vi.fn(async () => settings) };
}

function gateFor(space: Space, docsFirstFlag = true): CheckDocsGateUseCase {
  const resolver = {
    execute: vi.fn(async (repositoryPath: string) => ({
      repositoryPath,
      space,
      source: SpaceResolutionSource.Default,
    })),
  } as unknown as ResolveSpaceContextUseCase;
  return new CheckDocsGateUseCase(resolver, settingsWith(docsFirstFlag));
}

const DOCS_FIRST: Space = { ...DEFAULT_SPACE, agentSettings: { docsFirst: true } };

describe('CheckDocsGateUseCase (spec 131)', () => {
  it('asks nothing of a space without docs first', async () => {
    const gate = await gateFor(DEFAULT_SPACE).execute('/repo', ['src/a.ts']);
    expect(gate).toEqual({ required: false, passed: true, docsPaths: [], documentation: [] });
  });

  it('passes a docs-first change that touched documentation', async () => {
    const gate = await gateFor(DOCS_FIRST).execute('/repo', ['src/a.ts', 'docs/refunds.md']);
    expect(gate).toEqual({
      required: true,
      passed: true,
      docsPaths: ['docs/', 'README.md'],
      documentation: ['docs/refunds.md'],
    });
  });

  it('asks nothing while the docsFirst feature flag is off (spec 133)', async () => {
    const gate = await gateFor(DOCS_FIRST, false).execute('/repo', ['src/a.ts']);
    expect(gate).toEqual({ required: false, passed: true, docsPaths: [], documentation: [] });
  });

  it('holds a docs-first change that touched no documentation', async () => {
    const gate = await gateFor(DOCS_FIRST).execute('/repo', ['src/a.ts', 'specs/1/spec.md']);
    expect(gate.required).toBe(true);
    expect(gate.passed).toBe(false);
    expect(gate.documentation).toEqual([]);
  });
});
