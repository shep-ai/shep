/**
 * Unit tests for the Claude tagline generator. We never spawn the real
 * Claude CLI in tests — `claudeQuery` is injected so we can exercise the
 * happy path, the post-processing, and every fallback branch.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  generateTagline,
  STATIC_TAGLINE,
  __test__,
} from '../../../scripts/release-notes-claude.mjs';

const internals = __test__ as unknown as {
  postProcessTagline: (raw: string) => string | null;
  summarizeCommits: (commits: unknown[]) => string;
  hasAuthCredentials: (env: Record<string, string | undefined>) => boolean;
  hasUserFacingChanges: (commits: unknown[]) => boolean;
  isMaintenanceOnlyFraming: (tagline: string) => boolean;
  buildPrompt: (args: { commits: unknown[]; version: string }) => string;
};
const {
  postProcessTagline,
  summarizeCommits,
  hasAuthCredentials,
  hasUserFacingChanges,
  isMaintenanceOnlyFraming,
  buildPrompt,
} = internals;

function makeQuery(messages: unknown[]) {
  return vi.fn().mockReturnValue({
    [Symbol.asyncIterator]: async function* () {
      for (const msg of messages) yield msg;
    },
  });
}

const TEST_ENV = { CLAUDE_CODE_OAUTH_TOKEN: 'tok' } as unknown as NodeJS.ProcessEnv;
const EMPTY_ENV = {} as unknown as NodeJS.ProcessEnv;

describe('postProcessTagline', () => {
  it('trims, strips wrapping quotes, and removes leading >', () => {
    expect(postProcessTagline('"  hello world  "')).toBe('hello world');
    expect(postProcessTagline('> shipped fast')).toBe('shipped fast');
    expect(postProcessTagline('> "wrapped" ')).toBe('wrapped');
  });

  it('keeps only the first non-empty line', () => {
    expect(postProcessTagline('first line\nsecond line\nthird')).toBe('first line');
  });

  it('returns null for empty / whitespace input', () => {
    expect(postProcessTagline('')).toBeNull();
    expect(postProcessTagline('   ')).toBeNull();
    expect(postProcessTagline('"   "')).toBeNull();
  });

  it('truncates with an ellipsis above the char ceiling', () => {
    const long = 'x'.repeat(500);
    const out = postProcessTagline(long);
    expect(out).not.toBeNull();
    expect((out as string).length).toBeLessThanOrEqual(200);
    expect((out as string).endsWith('…')).toBe(true);
  });
});

describe('summarizeCommits', () => {
  it('only includes feat/fix/perf with a subject', () => {
    const summary = summarizeCommits([
      { type: 'feat', scope: 'web', subject: 'add tabs' },
      { type: 'fix', scope: 'cli', subject: 'crash on init' },
      { type: 'perf', scope: 'domain', subject: 'kill n+1' },
      { type: 'chore', scope: 'deps', subject: 'bump' },
      { type: 'docs', subject: 'tweak readme' },
      { type: 'feat', subject: '' },
    ]);
    expect(summary).toContain('feat(web): add tabs');
    expect(summary).toContain('fix(cli): crash on init');
    expect(summary).toContain('perf(domain): kill n+1');
    expect(summary).not.toContain('chore');
    expect(summary).not.toContain('docs');
  });

  it('strips markdown links from subjects', () => {
    const summary = summarizeCommits([
      { type: 'feat', subject: 'closes [#123](https://example.com/123)' },
    ]);
    expect(summary).toContain('closes #123');
    expect(summary).not.toContain('https://example.com/123');
  });
});

describe('hasAuthCredentials', () => {
  const RECOGNIZED_KEYS: readonly string[] = [
    'CLAUDE_CODE_OAUTH_TOKEN',
    'ANTHROPIC_API_KEY',
    'CLAUDE_API_KEY',
    'ANTHROPIC_AUTH_TOKEN',
  ];

  it.each(RECOGNIZED_KEYS)('returns true when %s is set', (key: string) => {
    expect(hasAuthCredentials({ [key]: 'x' })).toBe(true);
  });

  it('returns false when no recognized variable is set', () => {
    expect(hasAuthCredentials({})).toBe(false);
  });
});

describe('hasUserFacingChanges', () => {
  it('is true when any feat/fix/perf commit is present', () => {
    expect(hasUserFacingChanges([{ type: 'chore' }, { type: 'feat' }])).toBe(true);
    expect(hasUserFacingChanges([{ type: 'fix' }])).toBe(true);
  });

  it('is false for a chore/docs-only release', () => {
    expect(hasUserFacingChanges([{ type: 'chore' }, { type: 'docs' }])).toBe(false);
    expect(hasUserFacingChanges([])).toBe(false);
  });
});

describe('isMaintenanceOnlyFraming', () => {
  it('flags the contradictory framings that shipped in v1.210.0', () => {
    expect(
      isMaintenanceOnlyFraming(
        "Under the hood maintenance and housekeeping — no user-facing changes, just a cleaner foundation for what's next."
      )
    ).toBe(true);
    expect(isMaintenanceOnlyFraming('Behind the scenes cleanup')).toBe(true);
  });

  it('does not flag a legitimate feature tagline', () => {
    expect(isMaintenanceOnlyFraming('Ship ASPM — _security posture_ at a glance.')).toBe(false);
  });
});

describe('buildPrompt', () => {
  it('forbids maintenance framing when the release is user-facing', () => {
    const prompt = buildPrompt({
      commits: [{ type: 'feat', subject: 'add aspm' }],
      version: '1.210.0',
    });
    expect(prompt).toContain('SHIPS user-facing changes');
    expect(prompt).toContain('behind a feature flag');
  });

  it('allows a modest framing for a chore-only release', () => {
    const prompt = buildPrompt({
      commits: [{ type: 'chore', subject: 'bump deps' }],
      version: '1.0.0',
    });
    expect(prompt).toContain('chore-only release');
  });
});

describe('generateTagline', () => {
  it('rejects a maintenance-framed tagline when the release ships features', async () => {
    const claudeQuery = makeQuery([
      {
        type: 'result',
        subtype: 'success',
        result: 'Under the hood maintenance — no user-facing changes.',
      },
    ]);

    const tagline = await generateTagline({
      commits: [{ type: 'feat', subject: 'add aspm module' }],
      version: '1.210.0',
      claudeQuery,
      env: TEST_ENV,
      logger: { info: () => undefined, warn: () => undefined },
    });

    expect(tagline).toBeNull();
  });

  it('returns the Claude result string on success', async () => {
    const claudeQuery = makeQuery([
      {
        type: 'result',
        subtype: 'success',
        result: '> "Tabs galore — _every spec_ now has a story." ',
      },
    ]);

    const tagline = await generateTagline({
      commits: [{ type: 'feat', subject: 'tabs' }],
      version: '1.201.0',
      claudeQuery,
      env: TEST_ENV,
      logger: { info: () => undefined, warn: () => undefined },
    });

    expect(tagline).toBe('Tabs galore — _every spec_ now has a story.');
    expect(claudeQuery).toHaveBeenCalledOnce();
  });

  it('falls back to assistant text when there is no result message', async () => {
    const claudeQuery = makeQuery([
      {
        type: 'assistant',
        message: { content: [{ type: 'text', text: 'A new tagline' }] },
      },
    ]);

    const tagline = await generateTagline({
      commits: [],
      version: '1.0.0',
      claudeQuery,
      env: TEST_ENV,
    });

    expect(tagline).toBe('A new tagline');
  });

  it('returns null when no auth credentials are present', async () => {
    const claudeQuery = vi.fn();
    const tagline = await generateTagline({
      commits: [],
      version: '1.0.0',
      claudeQuery,
      env: EMPTY_ENV,
    });
    expect(tagline).toBeNull();
    expect(claudeQuery).not.toHaveBeenCalled();
  });

  it('returns null when Claude throws', async () => {
    const claudeQuery = vi.fn().mockImplementation(() => {
      throw new Error('boom');
    });
    const tagline = await generateTagline({
      commits: [],
      version: '1.0.0',
      claudeQuery,
      env: TEST_ENV,
      logger: { warn: () => undefined, info: () => undefined },
    });
    expect(tagline).toBeNull();
  });

  it('returns null when version is missing', async () => {
    const claudeQuery = vi.fn();
    const tagline = await generateTagline({ commits: [], claudeQuery, env: TEST_ENV } as never);
    expect(tagline).toBeNull();
    expect(claudeQuery).not.toHaveBeenCalled();
  });
});

describe('STATIC_TAGLINE', () => {
  it('is the canonical fallback string the plugin substitutes against', () => {
    expect(STATIC_TAGLINE).toContain('Run multiple AI agents in parallel');
    expect(STATIC_TAGLINE).toContain('Zero context-switching');
  });
});
