/**
 * Semantic Release Configuration
 *
 * Automates versioning and publishing based on conventional commits.
 * Publishes to npm registry and GitHub Container Registry (Docker).
 *
 * @see https://semantic-release.gitbook.io/
 * @type {import('semantic-release').GlobalConfig}
 */
export default {
  branches: ['main'],
  tagFormat: 'v${version}',

  plugins: [
    // 1. Analyze commits to determine version bump
    [
      '@semantic-release/commit-analyzer',
      {
        preset: 'angular',
        releaseRules: [
          { type: 'feat', release: 'minor' },
          { type: 'fix', release: 'patch' },
          { type: 'perf', release: 'patch' },
          { type: 'revert', release: 'patch' },
          { type: 'docs', release: false },
          { type: 'style', release: false },
          { type: 'refactor', release: 'patch' },
          { type: 'test', release: false },
          { type: 'build', release: false },
          { type: 'ci', release: false },
          { type: 'chore', release: false },
        ],
        parserOpts: {
          noteKeywords: ['BREAKING CHANGE', 'BREAKING CHANGES'],
        },
      },
    ],

    // 2. Generate release notes from commits
    [
      '@semantic-release/release-notes-generator',
      {
        preset: 'angular',
        writerOpts: {
          commitsSort: ['subject', 'scope'],
        },
      },
    ],

    // 3. Update CHANGELOG.md
    [
      '@semantic-release/changelog',
      {
        changelogFile: 'CHANGELOG.md',
      },
    ],

    // 4. Publish to npm registry
    '@semantic-release/npm',

    // 5. Create GitHub release (Docker handled by CI workflow with caching)
    [
      '@semantic-release/github',
      {
        assets: [
          { path: 'CHANGELOG.md', label: 'Changelog' },
          { path: 'electron-artifacts/*.dmg', label: 'Shep macOS (DMG)' },
          { path: 'electron-artifacts/*.exe', label: 'Shep Windows (Installer)' },
          { path: 'electron-artifacts/*.AppImage', label: 'Shep Linux (AppImage)' },
        ],
        successComment: false,
        failComment: false,
      },
    ],

    // 6. Commit updated files back to repo
    [
      '@semantic-release/git',
      {
        assets: ['CHANGELOG.md', 'package.json', 'pnpm-lock.yaml'],
        message: 'chore(release): ${nextRelease.version} [skip ci]\n\n${nextRelease.notes}',
      },
    ],

    // 7. Notify Slack on release
    [
      '@timebyping/semantic-release-slack-bot',
      {
        notifyOnSuccess: true,
        notifyOnFail: true,
      },
    ],
  ],
};
