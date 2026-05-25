/**
 * Commitlint Configuration
 *
 * Enforces Conventional Commits specification for consistent,
 * machine-readable commit messages.
 *
 * Format: <type>(<scope>): <subject>
 *
 * Types:
 *   feat     - New feature
 *   fix      - Bug fix
 *   docs     - Documentation only
 *   style    - Code style (formatting, semicolons, etc.)
 *   refactor - Code refactoring (no feature/fix)
 *   perf     - Performance improvement
 *   test     - Adding/updating tests
 *   build    - Build system or dependencies
 *   ci       - CI configuration
 *   chore    - Maintenance tasks
 *   revert   - Revert previous commit
 *
 * Scopes (optional):
 *   specs, cli, tui, web, api, domain, agents, deployment, tsp, deps, config, dx, release, ci
 *
 * Examples:
 *   feat(cli): add new analyze command
 *   fix(agents): resolve memory leak in feature agent
 *   docs(tsp): update domain model documentation
 *   chore(deps): upgrade TypeSpec to v0.61
 *
 * @see https://www.conventionalcommits.org/
 * @see https://commitlint.js.org/
 */

export default {
  extends: ['@commitlint/config-conventional'],
  // Ignore automated release commits from semantic-release
  // These contain changelog with long URLs that exceed line length limits
  ignores: [(commit) => commit.startsWith('chore(release):')],
  rules: {
    // Type must be one of the allowed values
    'type-enum': [
      2,
      'always',
      [
        'feat', // New feature
        'fix', // Bug fix
        'docs', // Documentation
        'style', // Formatting, missing semicolons, etc.
        'refactor', // Code change that neither fixes a bug nor adds a feature
        'perf', // Performance improvement
        'test', // Adding missing tests
        'build', // Changes to build system or dependencies
        'ci', // CI configuration changes
        'chore', // Maintenance tasks
        'revert', // Revert previous commit
      ],
    ],

    // Scope is optional but if provided, should be meaningful
    'scope-enum': [
      1, // Warning, not error
      'always',
      [
        'specs', // Feature specifications (shep-kit)
        'shep-kit', // Shep-kit skills and workflow
        'cli', // CLI commands and interface
        'tui', // Terminal UI
        'web', // Web UI
        'api', // API layer
        'domain', // Domain entities and services
        'agents', // AI agent system
        'deployment', // Deployment configuration
        'tsp', // TypeSpec models
        'deps', // Dependencies
        'config', // Configuration files
        'dx', // Developer experience
        'release', // Release related
        'ci', // CI/CD workflows
      ],
    ],

    // Subject case is not enforced — sentence-case, lowercase, or mixed are all accepted
    'subject-case': [0],
    'subject-empty': [2, 'never'],
    'subject-full-stop': [2, 'never', '.'],
    'subject-max-length': [2, 'always', 72],

    // Header (type + scope + subject) max length
    'header-max-length': [2, 'always', 100],

    // Body rules
    'body-leading-blank': [2, 'always'],
    'body-max-line-length': [2, 'always', 100],

    // Footer rules
    'footer-leading-blank': [2, 'always'],
    'footer-max-line-length': [2, 'always', 100],
  },
};
