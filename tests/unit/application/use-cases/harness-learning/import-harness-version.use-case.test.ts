import 'reflect-metadata';
import { describe, it, expect, vi } from 'vitest';
import { ImportHarnessVersionUseCase } from '@/application/use-cases/harness-learning/import-harness-version.use-case.js';
import {
  InMemoryEvidenceWorkspace,
  InMemoryLearnedHarnessRepository,
  fakeSettingsRepository,
} from '../../../../helpers/harness-learning.fakes.js';
import {
  HarnessComponentKind,
  HarnessOrigin,
  LearnedHarnessStatus,
  MemoryScope,
} from '@/domain/generated/output.js';

const SKILL = '---\nname: migrations\ndescription: Add a column safely\n---\nSteps.';

function build(dir: Record<string, string>, rejected: string[] = []) {
  const harnesses = new InMemoryLearnedHarnessRepository();
  const workspace = new InMemoryEvidenceWorkspace();
  workspace.directories.set('/my/harness', { tree: dir, rejected });
  const adopt = {
    execute: vi.fn(async ({ versionId }: { versionId: string }) => {
      await harnesses.adopt(versionId);
      return { adopted: true, memoryFactsRecorded: 0 };
    }),
  };
  const useCase = new ImportHarnessVersionUseCase(
    harnesses,
    workspace,
    fakeSettingsRepository(),
    adopt as never
  );
  return { useCase, harnesses, adopt };
}

const input = { repositoryPath: '/repos/app', directory: '/my/harness', actor: 'user:cli' };

describe('ImportHarnessVersionUseCase', () => {
  it('imports a directory as a Manual version and adopts it', async () => {
    const t = build({ 'guardrails.md': 'Run the tests.', 'skills/migrations/SKILL.md': SKILL });
    const result = await t.useCase.execute(input);

    expect(result).toMatchObject({ imported: true, adopted: true, problems: [] });
    const version = (await t.harnesses.findVersion(result.versionId!))!;
    expect(version).toMatchObject({
      origin: HarnessOrigin.Manual,
      scope: MemoryScope.Project,
      repositoryPath: '/repos/app',
      status: LearnedHarnessStatus.Adopted,
    });
    expect(version.components.map((c) => c.kind)).toContain(HarnessComponentKind.Skill);
    expect(version.components.find((c) => c.path === 'instructions.md')?.content).toContain(
      '`migrations`'
    );
    expect(t.adopt.execute).toHaveBeenCalledWith({ versionId: version.id, actor: 'user:cli' });
  });

  it('records the adopted version as the parent', async () => {
    const t = build({ 'guardrails.md': 'v2' });
    const first = await t.useCase.execute(input);
    t.harnesses.versions.forEach((v) => (v.components = []));
    const second = await t.useCase.execute(input);
    expect((await t.harnesses.findVersion(second.versionId!))!.parentVersionId).toBe(
      first.versionId
    );
  });

  it('refuses an empty, off-surface or invalid directory without storing anything', async () => {
    for (const [tree, rejected] of [
      [{}, []],
      [{ 'guardrails.md': 'ok' }, ['notes.txt']],
      [{ 'skills/broken/SKILL.md': 'no frontmatter' }, []],
    ] as const) {
      const t = build({ ...tree }, [...rejected]);
      const result = await t.useCase.execute(input);
      expect(result.imported).toBe(false);
      expect(result.problems.length).toBeGreaterThan(0);
      expect(t.harnesses.versions.size).toBe(0);
    }
  });

  it('refuses a directory identical to the adopted harness', async () => {
    const t = build({ 'guardrails.md': 'same' });
    await t.useCase.execute(input);
    const again = await t.useCase.execute(input);
    expect(again).toMatchObject({ imported: false, adopted: false });
    expect(t.harnesses.versions.size).toBe(1);
  });
});
