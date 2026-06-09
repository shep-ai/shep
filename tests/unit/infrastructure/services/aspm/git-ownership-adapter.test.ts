import { describe, it, expect } from 'vitest';
import { GitOwnershipAdapter } from '@/infrastructure/services/aspm/git-ownership-adapter';

describe('GitOwnershipAdapter', () => {
  it('aggregates authors by commit count, descending', async () => {
    const adapter = new GitOwnershipAdapter({
      runGit: async () =>
        ['alice@example.com', 'bob@example.com', 'alice@example.com', 'alice@example.com'].join(
          '\n'
        ),
    });
    const result = await adapter.lookup({ repoRoot: '/repo', assetPath: 'src/a.ts' });
    expect(result).toEqual([
      { email: 'alice@example.com', commitCount: 3 },
      { email: 'bob@example.com', commitCount: 1 },
    ]);
  });

  it('lowercases author emails so equivalent forms collapse', async () => {
    const adapter = new GitOwnershipAdapter({
      runGit: async () => 'Alice@Example.Com\nALICE@example.com',
    });
    const result = await adapter.lookup({ repoRoot: '/repo', assetPath: 'a.ts' });
    expect(result).toEqual([{ email: 'alice@example.com', commitCount: 2 }]);
  });

  it('falls back to CODEOWNERS when git log is empty', async () => {
    const adapter = new GitOwnershipAdapter({
      runGit: async () => '',
      fileExists: (path) => path.endsWith('CODEOWNERS') && path.includes('.github'),
      readFile: () => '# owners\n/src/api/**  @platform-team\n*.md  docs@example.com\n',
    });
    const result = await adapter.lookup({
      repoRoot: '/repo',
      assetPath: 'src/api/users.ts',
    });
    expect(result).toEqual([{ email: 'platform-team@noreply.github', commitCount: 0 }]);
  });

  it('returns [] when git throws and no CODEOWNERS file exists', async () => {
    const adapter = new GitOwnershipAdapter({
      runGit: async () => {
        throw new Error('not a git repo');
      },
      fileExists: () => false,
    });
    expect(await adapter.lookup({ repoRoot: '/no-repo', assetPath: 'whatever.txt' })).toEqual([]);
  });

  it('normalizes Windows-style paths before invoking git', async () => {
    const capturedArgs: string[][] = [];
    const adapter = new GitOwnershipAdapter({
      runGit: async (args) => {
        capturedArgs.push(args);
        return 'alice@example.com';
      },
    });
    await adapter.lookup({ repoRoot: '/repo', assetPath: 'src\\api\\users.ts' });
    expect(capturedArgs[0]).toContain('src/api/users.ts');
  });

  it('matches Markdown files via CODEOWNERS *.md pattern', async () => {
    const adapter = new GitOwnershipAdapter({
      runGit: async () => '',
      fileExists: () => true,
      readFile: () => '*.md  docs@example.com\n',
    });
    const result = await adapter.lookup({ repoRoot: '/r', assetPath: 'README.md' });
    expect(result).toEqual([{ email: 'docs@example.com', commitCount: 0 }]);
  });
});
