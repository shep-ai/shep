/**
 * Renders sample commits through the custom semantic-release writer options
 * and asserts that the output looks dev-rel-friendly: hero banner, emoji
 * groups, install commands, and community CTAs all present.
 */

import { describe, it, expect } from 'vitest';
import { writeChangelogString } from 'conventional-changelog-writer';
// @ts-expect-error -- conventional-changelog-angular ships ESM only, no .d.ts
import createAngularPreset from 'conventional-changelog-angular';
import { writerOpts as customWriterOpts } from '../../../scripts/release-notes-template.mjs';

const BASE_CONTEXT = {
  version: '1.196.0',
  previousTag: 'v1.195.1',
  currentTag: 'v1.196.0',
  date: '2026-05-03',
  host: 'https://github.com',
  owner: 'shep-ai',
  repository: 'shep',
  repoUrl: 'https://github.com/shep-ai/shep',
  linkCompare: true,
  linkReferences: true,
  commit: 'commit',
  issue: 'issues',
};

function makeCommit(overrides: Record<string, unknown>) {
  return {
    type: 'feat',
    scope: 'web',
    subject: 'add dark mode toggle',
    header: 'feat(web): add dark mode toggle',
    body: null,
    footer: null,
    notes: [],
    references: [],
    mentions: [],
    revert: null,
    hash: '1234567890abcdef1234567890abcdef12345678',
    ...overrides,
  };
}

async function render(commits: ReturnType<typeof makeCommit>[]) {
  const preset = await createAngularPreset();
  const merged = { ...preset.writer, ...customWriterOpts };
  return writeChangelogString(commits, BASE_CONTEXT, merged);
}

describe('release notes template', () => {
  it('renders the hero banner, version header, and tagline', async () => {
    const output = await render([makeCommit({})]);

    expect(output).toContain('docs/screenshots/shep-card.jpg');
    expect(output).toContain('🚀 Shep');
    expect(output).toContain('v1.196.0');
    expect(output).toContain('Run multiple AI agents in parallel');
  });

  it('groups commits by emoji-prefixed type', async () => {
    const output = await render([
      makeCommit({ type: 'feat', subject: 'add dark mode toggle' }),
      makeCommit({ type: 'fix', subject: 'login redirect bug', scope: 'web' }),
      makeCommit({ type: 'perf', subject: 'kill n+1 query', scope: 'domain' }),
      makeCommit({ type: 'refactor', subject: 'split worktree manager', scope: 'cli' }),
    ]);

    expect(output).toContain('### ✨ Features');
    expect(output).toContain('### 🐛 Bug Fixes');
    expect(output).toContain('### ⚡ Performance Improvements');
    expect(output).toContain('### ♻️ Code Refactoring');
  });

  it('orders sections so Features comes before Bug Fixes, Perf, and Refactoring', async () => {
    const output = await render([
      makeCommit({ type: 'refactor', subject: 'split worktree manager' }),
      makeCommit({ type: 'perf', subject: 'kill n+1 query' }),
      makeCommit({ type: 'fix', subject: 'login redirect bug' }),
      makeCommit({ type: 'feat', subject: 'add dark mode toggle' }),
    ]);

    const featuresIdx = output.indexOf('### ✨ Features');
    const fixesIdx = output.indexOf('### 🐛 Bug Fixes');
    const perfIdx = output.indexOf('### ⚡ Performance Improvements');
    const refactorIdx = output.indexOf('### ♻️ Code Refactoring');

    expect(featuresIdx).toBeGreaterThan(-1);
    expect(featuresIdx).toBeLessThan(fixesIdx);
    expect(fixesIdx).toBeLessThan(perfIdx);
    expect(perfIdx).toBeLessThan(refactorIdx);
  });

  it('renders breaking changes with a 🚨 prefix', async () => {
    const output = await render([
      makeCommit({
        type: 'feat',
        subject: 'rename CLI entrypoint',
        notes: [{ title: 'BREAKING CHANGE', text: 'shep is now @shepai/cli' }],
      }),
    ]);

    expect(output).toContain('🚨 Breaking Changes');
    expect(output).toContain('shep is now @shepai/cli');
  });

  it('hides commits that are not in the release-notes allow list', async () => {
    const output = await render([
      makeCommit({ type: 'chore', subject: 'bump deps' }),
      makeCommit({ type: 'ci', subject: 'tweak workflow' }),
      makeCommit({ type: 'test', subject: 'flaky harness' }),
    ]);

    expect(output).not.toContain('bump deps');
    expect(output).not.toContain('tweak workflow');
    expect(output).not.toContain('flaky harness');
  });

  it('embeds the version into the install command', async () => {
    const output = await render([makeCommit({})]);

    expect(output).toContain('npm i -g @shepai/cli@1.196.0');
    expect(output).toContain('npx @shepai/cli@latest');
  });

  it('includes community CTAs (Discord, docs, stars, issues)', async () => {
    const output = await render([makeCommit({})]);

    expect(output).toContain('discord.gg/ES6tdVFfur');
    expect(output).toContain('Star on GitHub');
    expect(output).toContain('Report an issue');
    expect(output).toContain('Released autonomously by Shep');
  });

  it('linkifies issue references in commit subjects', async () => {
    const output = await render([makeCommit({ subject: 'resolve a bug from #582 and #583' })]);

    expect(output).toContain('[#582](https://github.com/shep-ai/shep/issues/582)');
    expect(output).toContain('[#583](https://github.com/shep-ai/shep/issues/583)');
  });
});
