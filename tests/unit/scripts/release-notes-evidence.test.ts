/**
 * Unit tests for the evidence extractor used by the custom release-notes
 * plugin. Each input shape (markdown image, HTML img/video, GitHub
 * user-attachment, repo-relative evidence path) is exercised independently
 * so a regression in one regex is easy to localize.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  extractEvidenceFromBody,
  formatEvidenceMarkdown,
  getPrNumbersFromCommit,
  fetchPrBody,
  attachEvidenceToCommits,
} from '../../../scripts/release-notes-evidence.mjs';

const REPO = { owner: 'shep-ai', repo: 'shep' };

describe('extractEvidenceFromBody', () => {
  it('returns an empty array for empty / non-string input', () => {
    expect(extractEvidenceFromBody('', REPO)).toEqual([]);
    expect(extractEvidenceFromBody('   ', REPO)).toEqual([]);
    expect(extractEvidenceFromBody(null as unknown as string, REPO)).toEqual([]);
    expect(extractEvidenceFromBody(undefined as unknown as string, REPO)).toEqual([]);
  });

  it('extracts markdown image links', () => {
    const body =
      '## Evidence\n\n![dark mode](https://example.com/dark.png)\n![](https://example.com/light.jpg)';
    const evidence = extractEvidenceFromBody(body, REPO);

    expect(evidence).toHaveLength(2);
    expect(evidence[0]).toMatchObject({
      url: 'https://example.com/dark.png',
      alt: 'dark mode',
      kind: 'image',
    });
    expect(evidence[1].url).toBe('https://example.com/light.jpg');
    expect(evidence[1].alt.length).toBeGreaterThan(0);
  });

  it('extracts HTML <img> and <video> tags', () => {
    const body = `
      <img src="https://cdn.example.com/screenshot.png" alt="ignored">
      <video src="https://cdn.example.com/demo.mp4" controls></video>
    `;
    const evidence = extractEvidenceFromBody(body, REPO);

    expect(evidence.map((e) => e.url)).toEqual([
      'https://cdn.example.com/screenshot.png',
      'https://cdn.example.com/demo.mp4',
    ]);
    expect(evidence[0].kind).toBe('image');
    expect(evidence[1].kind).toBe('video');
  });

  it('extracts GitHub user-attachments URLs', () => {
    const body =
      'Check it out https://github.com/user-attachments/assets/abc123ef-1234-5678-90ab-cdef01234567 looks good';
    const evidence = extractEvidenceFromBody(body, REPO);

    expect(evidence).toHaveLength(1);
    expect(evidence[0].url).toBe(
      'https://github.com/user-attachments/assets/abc123ef-1234-5678-90ab-cdef01234567'
    );
  });

  it('converts repo-relative evidence paths into raw.githubusercontent.com URLs', () => {
    const body = `
      | File | Shows |
      | ---- | ----- |
      | \`specs/095-feature/evidence/screenshot.png\` | Real tab |
      | specs/095-feature/evidence/demo.mp4 | Demo |
    `;
    const evidence = extractEvidenceFromBody(body, REPO);

    expect(evidence.map((e) => e.url)).toEqual([
      'https://raw.githubusercontent.com/shep-ai/shep/main/specs/095-feature/evidence/screenshot.png',
      'https://raw.githubusercontent.com/shep-ai/shep/main/specs/095-feature/evidence/demo.mp4',
    ]);
    expect(evidence[1].kind).toBe('video');
  });

  it('honours the defaultBranch override for repo-relative paths', () => {
    const body = '`specs/foo/evidence/bar.png`';
    const evidence = extractEvidenceFromBody(body, { ...REPO, defaultBranch: 'develop' });

    expect(evidence[0].url).toBe(
      'https://raw.githubusercontent.com/shep-ai/shep/develop/specs/foo/evidence/bar.png'
    );
  });

  it('deduplicates URLs that appear multiple times', () => {
    const body = `
      ![first](https://example.com/img.png)
      <img src="https://example.com/img.png">
    `;
    const evidence = extractEvidenceFromBody(body, REPO);
    expect(evidence).toHaveLength(1);
  });

  it('caps evidence at 4 items per body to avoid blowing up notes', () => {
    const body = Array.from({ length: 10 }, (_, i) => `![alt](https://example.com/${i}.png)`).join(
      '\n'
    );
    const evidence = extractEvidenceFromBody(body, REPO);
    expect(evidence).toHaveLength(4);
  });

  it('does not emit repo paths when owner/repo are missing', () => {
    const body = '`specs/095-feature/evidence/screenshot.png`';
    const evidence = extractEvidenceFromBody(body, {});
    expect(evidence).toEqual([]);
  });
});

describe('formatEvidenceMarkdown', () => {
  it('renders images as standard markdown', () => {
    expect(formatEvidenceMarkdown({ url: 'https://x.com/a.png', alt: 'shot', kind: 'image' })).toBe(
      '![shot](https://x.com/a.png)'
    );
  });

  it('renders videos as a film-emoji link, not a markdown image', () => {
    expect(formatEvidenceMarkdown({ url: 'https://x.com/a.mp4', alt: 'demo', kind: 'video' })).toBe(
      '[\u{1F4F9} demo](https://x.com/a.mp4)'
    );
  });

  it('returns an empty string for malformed input', () => {
    expect(formatEvidenceMarkdown(null as never)).toBe('');
    expect(formatEvidenceMarkdown({} as never)).toBe('');
  });
});

describe('getPrNumbersFromCommit', () => {
  it('reads PR numbers from conventional-commits-parser references', () => {
    const commit = {
      references: [
        { issue: '596', prefix: '#' },
        { issue: '597', prefix: '#' },
      ],
    };
    expect(getPrNumbersFromCommit(commit)).toEqual(['596', '597']);
  });

  it('reads squash-merge PR numbers from the commit subject', () => {
    const commit = {
      subject: 'add feature (#596)',
      references: [],
    };
    expect(getPrNumbersFromCommit(commit)).toEqual(['596']);
  });

  it('unions references and inline references without duplicates', () => {
    const commit = {
      subject: 'add feature (#596) closes #100',
      references: [{ issue: '596' }, { issue: '101' }],
    };
    expect(getPrNumbersFromCommit(commit).sort()).toEqual(['100', '101', '596']);
  });

  it('returns an empty array when no PRs are referenced', () => {
    expect(getPrNumbersFromCommit({ subject: 'do a thing' })).toEqual([]);
  });
});

describe('fetchPrBody', () => {
  it('returns null when args are missing', async () => {
    const result = await fetchPrBody({
      owner: '',
      repo: 'shep',
      prNumber: 1,
      token: 'tok',
    });
    expect(result).toBeNull();
  });

  it('returns null on non-2xx responses', async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: false, status: 404, json: async () => ({}) });
    const result = await fetchPrBody({
      owner: 'shep-ai',
      repo: 'shep',
      prNumber: 1,
      token: 'tok',
      fetcher: fetcher as unknown as typeof fetch,
    });
    expect(result).toBeNull();
  });

  it('returns the PR body string on success', async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ body: '## Summary\n\n![ev](https://x/y.png)' }),
    });
    const result = await fetchPrBody({
      owner: 'shep-ai',
      repo: 'shep',
      prNumber: 1,
      token: 'tok',
      fetcher: fetcher as unknown as typeof fetch,
    });
    expect(result).toBe('## Summary\n\n![ev](https://x/y.png)');
    expect(fetcher).toHaveBeenCalledWith(
      'https://api.github.com/repos/shep-ai/shep/pulls/1',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer tok' }),
      })
    );
  });

  it('returns null when fetch throws (network error, etc.)', async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error('network down'));
    const result = await fetchPrBody({
      owner: 'shep-ai',
      repo: 'shep',
      prNumber: 1,
      token: 'tok',
      fetcher: fetcher as unknown as typeof fetch,
    });
    expect(result).toBeNull();
  });
});

describe('attachEvidenceToCommits', () => {
  it('attaches evidence pulled from referenced PR bodies', async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ body: '![](https://example.com/foo.png)' }),
    });
    const commits = [
      { type: 'feat', subject: 'add cool thing (#596)', references: [{ issue: '596' }] },
      { type: 'fix', subject: 'no PR here', references: [] },
    ];

    await attachEvidenceToCommits(commits as unknown[] as never[], {
      owner: 'shep-ai',
      repo: 'shep',
      token: 'tok',
      fetcher: fetcher as unknown as typeof fetch,
    });

    expect(commits[0]).toMatchObject({
      evidenceMarkdown: ['![foo](https://example.com/foo.png)'],
    });
    expect(commits[1]).not.toHaveProperty('evidenceMarkdown');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('is a no-op when token / repo are missing (graceful degrade)', async () => {
    const fetcher = vi.fn();
    const commits = [{ type: 'feat', subject: 'thing (#1)', references: [{ issue: '1' }] }];
    await attachEvidenceToCommits(commits as never[], { owner: '', repo: '', token: '', fetcher });
    expect(fetcher).not.toHaveBeenCalled();
    expect(commits[0]).not.toHaveProperty('evidenceMarkdown');
  });
});
