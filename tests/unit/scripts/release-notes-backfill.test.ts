/**
 * Unit tests for the release-tagline backfill: CHANGELOG.md is the source of
 * truth, and any GitHub release whose tagline is a Claude service error gets
 * the CHANGELOG tagline instead. `fetchFn` is injected — no network.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  parseChangelogTaglines,
  replaceErrorTagline,
  backfillReleaseTaglines,
} from '../../../scripts/release-notes-backfill.mjs';

const ACCESS_ERROR =
  'Your organization does not have access to Claude. Please login again or contact your administrator.';

function entry(version: string, tagline: string) {
  return [
    `# 🚀 Shep [${version}](/compare/v0...${version}) · _2026-10-29_`,
    '',
    `> ${tagline}`,
    '',
    '### 🐛 Bug Fixes',
    '',
    `* something for ${version}`,
    '',
  ].join('\n');
}

const CHANGELOG = [
  entry('v1.2.0', 'Fleets _resume with a click_.'),
  entry('v1.1.0', ACCESS_ERROR),
  entry('v1.0.0', 'The first release.'),
].join('\n');

describe('parseChangelogTaglines', () => {
  it('maps each version to the blockquote line under its header', () => {
    const taglines = parseChangelogTaglines(CHANGELOG);
    expect(taglines.get('v1.2.0')).toBe('Fleets _resume with a click_.');
    expect(taglines.get('v1.0.0')).toBe('The first release.');
    expect(taglines.size).toBe(3);
  });
});

describe('replaceErrorTagline', () => {
  it('swaps a service-error tagline for the given one', () => {
    const body = entry('v1.1.0', ACCESS_ERROR);
    const fixed = replaceErrorTagline(body, 'Fixed line.');
    expect(fixed).toContain('> Fixed line.');
    expect(fixed).not.toContain('does not have access');
    expect(fixed).toContain('* something for v1.1.0');
  });

  it('returns null when the body has no service-error tagline', () => {
    expect(replaceErrorTagline(entry('v1.0.0', 'The first release.'), 'X')).toBeNull();
  });
});

describe('backfillReleaseTaglines', () => {
  function releases() {
    return [
      { id: 3, tag_name: 'v1.2.0', body: entry('v1.2.0', 'Fleets _resume with a click_.') },
      { id: 2, tag_name: 'v1.1.0', body: entry('v1.1.0', ACCESS_ERROR) },
      { id: 1, tag_name: 'v1.0.0', body: entry('v1.0.0', ACCESS_ERROR) },
    ];
  }

  function makeFetch(pages: unknown[][]) {
    return vi.fn(async (url: string, init?: { method?: string }) => {
      if (init?.method === 'PATCH') return { ok: true, status: 200, json: async () => ({}) };
      const page = Number(new URL(url).searchParams.get('page'));
      return { ok: true, status: 200, json: async () => pages[page - 1] ?? [] };
    });
  }

  const quiet = { info: () => undefined, warn: () => undefined };
  const changelog = [
    entry('v1.2.0', 'Fleets _resume with a click_.'),
    entry('v1.1.0', 'Fixed tagline for 1.1.'),
    entry('v1.0.0', ACCESS_ERROR),
  ].join('\n');

  it('reports what it would change without writing in dry-run mode', async () => {
    const fetchFn = makeFetch([releases()]);
    const result = await backfillReleaseTaglines({
      changelog,
      repo: 'shep-ai/shep',
      token: 't',
      apply: false,
      fetchFn,
      logger: quiet,
    });
    expect(result.updated).toEqual(['v1.1.0']);
    expect(result.missing).toEqual(['v1.0.0']);
    expect(fetchFn.mock.calls.some(([, init]) => init?.method === 'PATCH')).toBe(false);
  });

  it('patches only releases whose tagline is a service error, with --apply', async () => {
    const fetchFn = makeFetch([releases()]);
    await backfillReleaseTaglines({
      changelog,
      repo: 'shep-ai/shep',
      token: 't',
      apply: true,
      fetchFn,
      logger: quiet,
    });
    const patches = fetchFn.mock.calls.filter(([, init]) => init?.method === 'PATCH');
    expect(patches).toHaveLength(1);
    const [url, init] = patches[0] as [string, { body: string; headers: Record<string, string> }];
    expect(url).toBe('https://api.github.com/repos/shep-ai/shep/releases/2');
    expect(init.headers.Authorization).toBe('Bearer t');
    const body = JSON.parse(init.body).body as string;
    expect(body).toContain('> Fixed tagline for 1.1.');
    expect(body).not.toContain('does not have access');
  });

  it('reads every page of releases', async () => {
    const page1 = Array.from({ length: 100 }, (_, i) => ({
      id: 100 + i,
      tag_name: `v9.${i}.0`,
      body: entry(`v9.${i}.0`, 'Fine.'),
    }));
    const fetchFn = makeFetch([page1, releases()]);
    const result = await backfillReleaseTaglines({
      changelog,
      repo: 'shep-ai/shep',
      token: 't',
      apply: false,
      fetchFn,
      logger: quiet,
    });
    expect(result.updated).toEqual(['v1.1.0']);
  });

  it('throws when GitHub refuses the request', async () => {
    const fetchFn = vi.fn(async () => ({ ok: false, status: 401, json: async () => ({}) }));
    await expect(
      backfillReleaseTaglines({
        changelog,
        repo: 'shep-ai/shep',
        token: 't',
        apply: false,
        fetchFn,
        logger: quiet,
      })
    ).rejects.toThrow(/401/);
  });
});
