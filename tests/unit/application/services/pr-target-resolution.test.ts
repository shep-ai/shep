import 'reflect-metadata';
import { describe, it, expect } from 'vitest';
import {
  resolvePrTarget,
  type PrTargetInputs,
} from '@/application/services/pr-target-resolution.js';

const sshUrl = 'git@github.com:kevinnguyenhoang91/shep.git';
const upstreamSshUrl = 'git@github.com:shep-ai/shep.git';
const httpsUrl = 'https://github.com/kevinnguyenhoang91/shep.git';

function inputs(overrides: Partial<PrTargetInputs> = {}): PrTargetInputs {
  return {
    remotes: [
      { name: 'origin', url: sshUrl },
      { name: 'upstream', url: upstreamSshUrl },
    ],
    forkParent: null,
    branch: 'fix/pr_upstream',
    fallbackBaseBranch: 'main',
    ...overrides,
  };
}

describe('resolvePrTarget', () => {
  it('resolves upstream target when an upstream remote exists (SSH url)', () => {
    expect(resolvePrTarget(inputs())).toEqual({
      targetRepo: 'shep-ai/shep',
      baseBranch: 'main',
      headRef: 'kevinnguyenhoang91:fix/pr_upstream',
    });
  });

  it('resolves upstream target from HTTPS urls', () => {
    expect(
      resolvePrTarget(
        inputs({
          remotes: [
            { name: 'origin', url: httpsUrl },
            { name: 'upstream', url: 'https://github.com/shep-ai/shep.git' },
          ],
        })
      )
    ).toEqual({
      targetRepo: 'shep-ai/shep',
      baseBranch: 'main',
      headRef: 'kevinnguyenhoang91:fix/pr_upstream',
    });
  });

  it('uses forkParent default branch as base when parent matches upstream remote', () => {
    expect(
      resolvePrTarget(
        inputs({
          forkParent: {
            owner: 'shep-ai',
            repo: 'shep',
            defaultBranch: 'develop',
          },
        })
      )
    ).toMatchObject({ targetRepo: 'shep-ai/shep', baseBranch: 'develop' });
  });

  it('falls back to forkParent when no upstream remote exists', () => {
    expect(
      resolvePrTarget(
        inputs({
          remotes: [{ name: 'origin', url: sshUrl }],
          forkParent: { owner: 'shep-ai', repo: 'shep', defaultBranch: 'main' },
        })
      )
    ).toEqual({
      targetRepo: 'shep-ai/shep',
      baseBranch: 'main',
      headRef: 'kevinnguyenhoang91:fix/pr_upstream',
    });
  });

  it('returns null for a plain repo without upstream or fork parent', () => {
    expect(resolvePrTarget(inputs({ remotes: [{ name: 'origin', url: sshUrl }] }))).toBeNull();
  });

  it('returns null when upstream remote is unparseable', () => {
    expect(
      resolvePrTarget(
        inputs({
          remotes: [
            { name: 'origin', url: sshUrl },
            { name: 'upstream', url: 'not-a-url' },
          ],
        })
      )
    ).toBeNull();
  });

  it('returns null when origin cannot be parsed for head qualification', () => {
    expect(
      resolvePrTarget(
        inputs({
          remotes: [
            { name: 'origin', url: 'file:///local/path' },
            { name: 'upstream', url: upstreamSshUrl },
          ],
        })
      )
    ).toBeNull();
  });

  it('returns null when upstream remote url is empty', () => {
    expect(
      resolvePrTarget(
        inputs({
          remotes: [
            { name: 'origin', url: sshUrl },
            { name: 'upstream', url: '' },
          ],
        })
      )
    ).toBeNull();
  });
});
