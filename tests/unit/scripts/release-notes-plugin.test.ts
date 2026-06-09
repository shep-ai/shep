/**
 * End-to-end test for the custom release-notes plugin: feeds it commits,
 * stubs out Claude + GitHub fetches, and asserts the rendered notes pick
 * up both the Claude tagline replacement and inline evidence under each
 * commit line.
 */

import { describe, it, expect, vi } from 'vitest';
import { generateNotes, __test__ } from '../../../scripts/release-notes-plugin.mjs';
import { STATIC_TAGLINE } from '../../../scripts/release-notes-claude.mjs';

const internals = __test__ as unknown as {
  parseRepoFromUrl: (url: string | null | undefined) => { owner: string; repo: string } | null;
  replaceTagline: (notes: string, tagline: string | null) => string;
  getGitHubToken: (env: Record<string, string | undefined>) => string | null;
};
const { parseRepoFromUrl, replaceTagline, getGitHubToken } = internals;

interface TestContext {
  cwd: string;
  options: { repositoryUrl: string };
  lastRelease: { gitTag: string; gitHead: string };
  nextRelease: { version: string; gitTag: string; gitHead: string };
  commits: unknown[];
  env: Record<string, string | undefined>;
  logger: {
    info: (m?: unknown) => undefined;
    warn: (m?: unknown) => undefined;
    error: (m?: unknown) => undefined;
  };
}

function makeContext(overrides: Partial<TestContext> = {}): TestContext {
  return {
    cwd: process.cwd(),
    options: {
      repositoryUrl: 'https://github.com/shep-ai/shep.git',
    },
    lastRelease: { gitTag: 'v1.199.0', gitHead: 'aaaaaaa' },
    nextRelease: {
      version: '1.200.0',
      gitTag: 'v1.200.0',
      gitHead: 'bbbbbbb',
    },
    commits: [],
    env: {},
    logger: { info: () => undefined, warn: () => undefined, error: () => undefined },
    ...overrides,
  };
}

function makeRawCommit(overrides: Record<string, unknown> = {}) {
  return {
    hash: '1234567890abcdef1234567890abcdef12345678',
    message: 'feat(web): add cool feature (#596)\n',
    committerDate: '2026-05-04',
    ...overrides,
  };
}

function fakeFetcher(bodyByPr: Record<string, string>) {
  return vi.fn(async (url: string) => {
    const match = url.match(/\/pulls\/(\d+)$/);
    const prNumber = match ? match[1] : null;
    if (!prNumber || !(prNumber in bodyByPr)) {
      return { ok: false, status: 404, json: async () => ({}) } as unknown as Response;
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({ body: bodyByPr[prNumber] }),
    } as unknown as Response;
  });
}

function fakeClaudeQuery(taglineText: string) {
  return vi.fn().mockReturnValue({
    [Symbol.asyncIterator]: async function* () {
      yield { type: 'result', subtype: 'success', result: taglineText };
    },
  });
}

describe('parseRepoFromUrl', () => {
  const cases: [string, { owner: string; repo: string }][] = [
    ['https://github.com/shep-ai/shep.git', { owner: 'shep-ai', repo: 'shep' }],
    ['https://github.com/shep-ai/shep', { owner: 'shep-ai', repo: 'shep' }],
    ['git@github.com:shep-ai/shep.git', { owner: 'shep-ai', repo: 'shep' }],
  ];

  it.each(cases)('parses %s', (url: string, expected: { owner: string; repo: string }) => {
    expect(parseRepoFromUrl(url)).toEqual(expected);
  });

  it('returns null for malformed urls', () => {
    expect(parseRepoFromUrl('')).toBeNull();
    expect(parseRepoFromUrl(null)).toBeNull();
    expect(parseRepoFromUrl('not a url')).toBeNull();
  });
});

describe('replaceTagline', () => {
  it('replaces the static tagline with the provided one', () => {
    const notes = `> ${STATIC_TAGLINE}\n\nrest`;
    const out = replaceTagline(notes, 'fresh tagline');
    expect(out).toContain('> fresh tagline');
    expect(out).not.toContain(STATIC_TAGLINE);
  });

  it('is a no-op when tagline is null / matches the static one', () => {
    const notes = `> ${STATIC_TAGLINE}`;
    expect(replaceTagline(notes, null)).toBe(notes);
    expect(replaceTagline(notes, STATIC_TAGLINE)).toBe(notes);
  });
});

describe('getGitHubToken', () => {
  const cases: [string, string][] = [
    ['GITHUB_TOKEN', 'a'],
    ['GH_TOKEN', 'b'],
    ['RELEASE_TOKEN', 'c'],
    ['GITHUB_PAT', 'd'],
  ];
  it.each(cases)('reads %s', (key: string, value: string) => {
    expect(getGitHubToken({ [key]: value })).toBe(value);
  });

  it('returns null when nothing is set', () => {
    expect(getGitHubToken({})).toBeNull();
  });
});

describe('generateNotes (plugin)', () => {
  it('substitutes the Claude-generated tagline into the rendered notes', async () => {
    const context = makeContext({
      commits: [makeRawCommit()],
      env: {
        CLAUDE_CODE_OAUTH_TOKEN: 'tok',
        GITHUB_TOKEN: 'gh',
      },
    });

    const claudeQuery = fakeClaudeQuery(
      'Spec tabs everywhere — _every feature_ now narrates itself.'
    );
    const fetcher = fakeFetcher({});

    const notes = await generateNotes(
      {
        claudeQuery,
        defaultBranch: 'main',
        writerOpts: {},
        fetcher,
      },
      context as never
    );

    expect(claudeQuery).toHaveBeenCalledOnce();
    expect(notes).toContain('Spec tabs everywhere');
    expect(notes).not.toContain(STATIC_TAGLINE);
  });

  it('embeds inline evidence images from the linked PR body', async () => {
    const context = makeContext({
      commits: [makeRawCommit()],
      env: {
        CLAUDE_CODE_OAUTH_TOKEN: 'tok',
        GITHUB_TOKEN: 'gh',
      },
    });
    const fetcher = fakeFetcher({
      '596': '## Summary\n\n![dark-mode](https://example.com/screenshot.png)',
    });
    const claudeQuery = fakeClaudeQuery('shipped tabs');

    const notes = await generateNotes({ claudeQuery, fetcher }, context as never);

    expect(notes).toContain('![dark-mode](https://example.com/screenshot.png)');
  });

  it('rewrites branch-pinned evidence URLs to the release tag', async () => {
    const context = makeContext({
      commits: [makeRawCommit()],
      env: {
        CLAUDE_CODE_OAUTH_TOKEN: 'tok',
        GITHUB_TOKEN: 'gh',
      },
    });
    const fetcher = fakeFetcher({
      '596':
        '![dash](https://raw.githubusercontent.com/shep-ai/shep/feat/my-branch/specs/098/evidence/app.png)',
    });
    const claudeQuery = fakeClaudeQuery('shipped tabs');

    const notes = await generateNotes({ claudeQuery, fetcher }, context as never);

    // makeContext sets nextRelease.gitTag to v1.200.0
    expect(notes).toContain(
      '![dash](https://raw.githubusercontent.com/shep-ai/shep/v1.200.0/specs/098/evidence/app.png)'
    );
    expect(notes).not.toContain('feat/my-branch');
  });

  it('falls back to the static tagline when Claude returns nothing', async () => {
    const context = makeContext({
      commits: [makeRawCommit()],
      env: { GITHUB_TOKEN: 'gh' },
    });

    const claudeQuery = fakeClaudeQuery('   ');
    const fetcher = fakeFetcher({});

    const notes = await generateNotes({ claudeQuery, fetcher }, context as never);

    expect(notes).toContain(STATIC_TAGLINE);
  });

  it('does not call Claude or the GitHub API when no tokens are set', async () => {
    const context = makeContext({
      commits: [makeRawCommit()],
      env: {},
    });

    const claudeQuery = vi.fn();
    const fetcher = vi.fn();

    const notes = await generateNotes({ claudeQuery, fetcher }, context as never);

    expect(claudeQuery).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
    expect(notes).toContain(STATIC_TAGLINE);
  });
});
