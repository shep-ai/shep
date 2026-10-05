import { describe, it, expect, vi } from 'vitest';
import { docsBlockAutoMerge } from '@/infrastructure/services/agents/feature-agent/nodes/merge/docs-gate.js';

const log = { info: vi.fn() };

function input(overrides: Record<string, unknown> = {}) {
  return {
    gitPrService: { getFileDiffs: vi.fn().mockResolvedValue([{ path: 'src/a.ts' }]) },
    repositoryPath: '/repo',
    cwd: '/wt',
    baseBranch: 'main',
    messages: [] as string[],
    log,
    ...overrides,
  } as Parameters<typeof docsBlockAutoMerge>[0];
}

describe('docsBlockAutoMerge (spec 131)', () => {
  it('never blocks without a gate', async () => {
    expect(await docsBlockAutoMerge(input())).toBe(false);
  });

  it('blocks a change without documentation and says which paths it checked', async () => {
    const checkDocsGate = vi.fn().mockResolvedValue({
      required: true,
      passed: false,
      docsPaths: ['docs/'],
      documentation: [],
    });
    const args = input({ checkDocsGate });
    expect(await docsBlockAutoMerge(args)).toBe(true);
    expect(checkDocsGate).toHaveBeenCalledWith('/repo', ['src/a.ts']);
    expect(args.messages[0]).toContain('docs/');
  });

  it('holds when the changed files cannot be listed in a docs-first space only', async () => {
    const failing = { getFileDiffs: vi.fn().mockRejectedValue(new Error('git died')) };
    const required = vi
      .fn()
      .mockResolvedValue({ required: true, passed: false, docsPaths: [], documentation: [] });
    const args = input({ gitPrService: failing, checkDocsGate: required });
    expect(await docsBlockAutoMerge(args)).toBe(true);
    expect(args.messages[0]).toContain('git died');

    const notRequired = vi
      .fn()
      .mockResolvedValue({ required: false, passed: true, docsPaths: [], documentation: [] });
    expect(
      await docsBlockAutoMerge(input({ gitPrService: failing, checkDocsGate: notRequired }))
    ).toBe(false);
  });
});
