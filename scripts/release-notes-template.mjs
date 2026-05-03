/**
 * Custom semantic-release writer options for dev-rel friendly release notes.
 *
 * Replaces the spartan angular-preset output with:
 *   - a hero banner that surfaces in the GitHub releases feed (OG-image style)
 *   - emoji-grouped commit sections (✨ Features, 🐛 Bug Fixes, ⚡ Performance, …)
 *   - install / update commands keyed to the published version
 *   - community CTAs (Discord, docs, stars, issues)
 *
 * Used by release.config.mjs and tested in
 * tests/unit/scripts/release-notes-template.test.ts.
 *
 * The exported writerOpts is merged on top of conventional-changelog-angular's
 * writerOpts by @semantic-release/release-notes-generator, so we only override
 * the keys we care about (transform, headerPartial, footerPartial).
 */

const COMMIT_HASH_LENGTH = 7;

const TYPE_LABELS = {
  feat: '✨ Features',
  fix: '🐛 Bug Fixes',
  perf: '⚡ Performance Improvements',
  revert: '⏪ Reverts',
  refactor: '♻️ Code Refactoring',
};

// Display order for the grouped sections — features lead because they are
// the most attention-worthy in the GitHub feed; emoji-unicode sorting alone
// would surface ⚡ Performance ahead of ✨ Features.
const TYPE_DISPLAY_ORDER = [
  '✨ Features',
  '🐛 Bug Fixes',
  '⚡ Performance Improvements',
  '♻️ Code Refactoring',
  '⏪ Reverts',
];

function commitGroupsSort(a, b) {
  const aIdx = TYPE_DISPLAY_ORDER.indexOf(a.title);
  const bIdx = TYPE_DISPLAY_ORDER.indexOf(b.title);
  const aRank = aIdx === -1 ? Number.MAX_SAFE_INTEGER : aIdx;
  const bRank = bIdx === -1 ? Number.MAX_SAFE_INTEGER : bIdx;
  if (aRank !== bRank) return aRank - bRank;
  return String(a.title).localeCompare(String(b.title));
}

export function transform(commit, context) {
  let discard = true;
  const notes = commit.notes.map((note) => {
    discard = false;
    return { ...note, title: '🚨 Breaking Changes' };
  });

  let type = TYPE_LABELS[commit.type];
  if (!type && commit.revert) type = TYPE_LABELS.revert;
  if (!type && discard) return undefined;
  if (!type) type = commit.type;

  const scope = commit.scope === '*' ? '' : commit.scope;
  const shortHash =
    typeof commit.hash === 'string'
      ? commit.hash.substring(0, COMMIT_HASH_LENGTH)
      : commit.shortHash;

  const issues = [];
  let { subject } = commit;

  if (typeof subject === 'string') {
    const baseUrl = context.repository
      ? `${context.host}/${context.owner}/${context.repository}`
      : context.repoUrl;

    if (baseUrl) {
      const issueUrl = `${baseUrl}/issues/`;
      subject = subject.replace(/#([0-9]+)/g, (_, issue) => {
        issues.push(issue);
        return `[#${issue}](${issueUrl}${issue})`;
      });
    }

    if (context.host) {
      subject = subject.replace(/\B@([a-z0-9](?:-?[a-z0-9/]){0,38})/g, (_, username) => {
        if (username.includes('/')) return `@${username}`;
        return `[@${username}](${context.host}/${username})`;
      });
    }
  }

  const references = commit.references.filter((ref) => !issues.includes(ref.issue));

  return { notes, type, scope, shortHash, subject, references };
}

export const headerPartial = `<p align="center">
  <a href="https://github.com/shep-ai/shep">
    <img src="https://raw.githubusercontent.com/shep-ai/shep/main/docs/screenshots/shep-card.jpg" alt="Shep — run multiple AI agents in parallel" width="720" />
  </a>
</p>

# 🚀 Shep {{#if @root.linkCompare~}}[v{{version}}]({{~@root.repoUrl}}/compare/{{previousTag}}...{{currentTag}}){{~else}}v{{version}}{{~/if}}{{~#if title}} · {{title}}{{~/if}}{{~#if date}} · _{{date}}_{{~/if}}

> Run multiple AI agents in parallel — each in its own worktree, branch, and PR. _Zero context-switching, zero merge chaos._

`;

export const footerPartial = `{{#if noteGroups}}
{{#each noteGroups}}

### {{title}}

{{#each notes}}
* {{#if commit.scope}}**{{commit.scope}}:** {{/if}}{{text}}
{{/each}}
{{/each}}

{{/if}}
## 📦 Install or update

\`\`\`bash
# upgrade an existing install
npm i -g @shepai/cli@{{version}}

# or run instantly without installing
npx @shepai/cli@latest
\`\`\`

## 💬 Join the community

[💬 **Discord**](https://discord.gg/ES6tdVFfur) · [📖 **Docs**](https://github.com/shep-ai/shep#readme) · [⭐ **Star on GitHub**](https://github.com/shep-ai/shep) · [🐛 **Report an issue**](https://github.com/shep-ai/shep/issues)

---

<sub>🤖 Released autonomously by Shep — built by parallel AI agents working in isolated git worktrees. Try it: \`npx @shepai/cli\`</sub>
`;

export const writerOpts = {
  transform,
  groupBy: 'type',
  commitGroupsSort,
  commitsSort: ['subject', 'scope'],
  noteGroupsSort: 'title',
  headerPartial,
  footerPartial,
};
