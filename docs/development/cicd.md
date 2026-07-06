# CI/CD Pipeline

Automated build, test, and release pipeline using GitHub Actions.

## Pipeline Overview

```
Push/PR to main or develop:
┌──────────┬───────────┬────────────┬───────────┬───────────┬───────────┬───────────┐
│   Lint   │ Typecheck │ Unit Tests │  E2E CLI  │  E2E TUI  │  E2E Web  │ Storybook │
└──────────┴───────────┴────────────┴───────────┴───────────┴───────────┴───────────┘
┌──────────┬─────────┬──────────────────┐
│ Gitleaks │ Semgrep │ Security Enforce │
└──────────┴─────────┴──────────────────┘
                            (all run in parallel)

On PR only:
┌──────────────────────────────────────────────────────────────────────┐
│  Claude Review  │  Documentation & Architecture compliance check    │
└──────────────────────────────────────────────────────────────────────┘

On push to main only (after ALL jobs pass, including security):
┌───────────┐
│  Release  │  → npm publish + GitHub release + `v<version>` tag
└───────────┘

On `v*` tag push (created by Release) or manual dispatch:
┌────────────────┐
│ Docker Publish │  → build image + push to ghcr.io
└────────────────┘
```

## Jobs

### Parallel Jobs (All Branches)

| Job                   | Description                                                 | Duration |
| --------------------- | ----------------------------------------------------------- | -------- |
| **Lint & Format**     | ESLint + Prettier + TypeSpec compile (`pnpm tsp:compile`)   | ~30s     |
| **Type Check**        | TypeScript strict mode validation (requires TypeSpec types) | ~20s     |
| **Unit Tests**        | Vitest unit + integration tests (Linux + Windows)           | ~20s     |
| **E2E (CLI)**         | CLI command execution tests (Linux + Windows)               | ~30s     |
| **E2E (TUI)**         | Terminal UI interaction tests                               | ~20s     |
| **E2E (Web)**         | Playwright browser tests                                    | ~25s     |
| **Storybook Build**   | Builds all stories (catches missing mocks/broken imports)   | ~40s     |
| **Electron**          | Desktop installers for macOS/Windows/Linux                  | ~5m      |

> **Note:** Docker images are not built in the CI matrix. They are published by
> the separate [`docker-publish.yml`](../../.github/workflows/docker-publish.yml)
> workflow, triggered by the `v*` release tag (see [Docker Images](#docker-images)).

### Security Jobs (All Branches)

Security scanners run in parallel and **block releases on main**:

| Scanner               | Tool                                                            | Severity Filter |
| --------------------- | --------------------------------------------------------------- | --------------- |
| **Gitleaks**          | Secret detection (API keys, passwords, tokens)                  | All findings    |
| **Semgrep**           | SAST rules (`p/typescript`, `p/javascript`, `p/security-audit`) | All findings    |
| **Security Enforce**  | `shep security enforce` — supply-chain/governance posture       | Gates release   |

> **Note:** Gitleaks uses the CLI directly (not gitleaks-action) because the GitHub Action requires a paid license for organizations.

### Claude Review Job (PRs Only)

Automated code review using Claude Code, focusing on:

| Check Area                    | What It Validates                                     |
| ----------------------------- | ----------------------------------------------------- |
| **Documentation Consistency** | Changes reflected in docs/, CLAUDE.md, AGENTS.md      |
| **Architecture Compliance**   | Clean Architecture layers, dependency rule, patterns  |
| **TDD & Testing**             | Test coverage for new functionality                   |
| **Spec-Driven Workflow**      | Feature PRs have specs/ directory with required files |

**Review Output:**

- Inline comments on specific code issues
- Summary PR comment with findings and action items

**Required Secret:** `CLAUDE_CODE_OAUTH_TOKEN` (org-level)

### Release Job (Main Only)

Runs after **all parallel jobs pass, including security scanners**. Uses [semantic-release](https://semantic-release.gitbook.io/) to:

1. **Analyze commits** - Determine version bump from conventional commits
2. **Generate changelog** - Create release notes from commits
3. **Update CHANGELOG.md** - Append new release section
4. **Publish to npm** - `@shepai/cli` package
5. **Create GitHub release** - With changelog as release notes
6. **Commit changes** - `chore(release): <version> [skip ci]`
7. **Push `v<version>` tag** - triggers the `Docker Publish` workflow

Docker images are built and pushed by the separate
[`docker-publish.yml`](../../.github/workflows/docker-publish.yml) workflow,
which fires on the `v*` tag that semantic-release pushes (and can be run
manually via workflow dispatch).

## Docker Images

### Registry

Images are published to GitHub Container Registry (ghcr.io):

```
ghcr.io/shep-ai/shep
```

### Tagging Strategy

| Trigger                    | Tags                                                        |
| -------------------------- | ----------------------------------------------------------- |
| `v*` tag (from release)    | `latest`, `1.2.3`, `1.2`, `1`, `sha-<full-commit-sha>`      |
| Manual dispatch (main)     | `latest`, `sha-<full-commit-sha>`                           |

### Pull & Run

```bash
# Latest stable
docker pull ghcr.io/shep-ai/shep:latest
docker run ghcr.io/shep-ai/shep --version

# Specific version
docker pull ghcr.io/shep-ai/shep:v1.0.0

# Specific commit (for testing)
docker pull ghcr.io/shep-ai/shep:sha-abc123...
```

### Image Details

- **Base**: `node:22-alpine` (~180MB)
- **Final size**: ~185MB
- **User**: Non-root `shep` (UID 1001)
- **Entrypoint**: `node dist/src/presentation/cli/index.js`

## Release Process

### Automatic Releases

Releases are fully automated based on [Conventional Commits](https://www.conventionalcommits.org/):

| Commit Type       | Version Bump  | Example                                     |
| ----------------- | ------------- | ------------------------------------------- |
| `feat:`           | Minor (0.X.0) | `feat(cli): add analyze command`            |
| `fix:`            | Patch (0.0.X) | `fix(agents): resolve memory leak`          |
| `perf:`           | Patch         | `perf(db): optimize query performance`      |
| `refactor:`       | Patch         | `refactor(core): simplify state management` |
| `BREAKING CHANGE` | Major (X.0.0) | Footer in commit message                    |

Commits that **don't** trigger releases:

- `docs:`, `style:`, `test:`, `build:`, `ci:`, `chore:`

### Manual Release (Not Recommended)

If needed, you can trigger a release manually:

```bash
# Ensure you're on main with latest changes
git checkout main && git pull

# Run semantic-release in dry-run mode first
npx semantic-release --dry-run

# If satisfied, run actual release (requires NPM_TOKEN)
NPM_TOKEN=xxx GITHUB_TOKEN=xxx npx semantic-release
```

## Configuration Files

| File                                  | Purpose                                              |
| ------------------------------------- | ---------------------------------------------------- |
| `.github/workflows/ci.yml`            | Main CI/CD workflow (build, test, security, release) |
| `.github/workflows/docker-publish.yml`| Build & push the image to ghcr.io on `v*` tags       |
| `.github/workflows/pr-check.yml`      | PR-specific checks (commitlint, PR title)            |
| `.github/workflows/claude-review.yml` | Claude Code automated review                         |
| `release.config.mjs`                  | semantic-release plugins and settings                |
| `Dockerfile`                          | Multi-stage build for production image               |
| `.dockerignore`                       | Files excluded from Docker build context             |
| `commitlint.config.mjs`               | Commit message validation rules                      |

## Limitations & Considerations

### Docker Cache

- **PR builds**: Use GitHub Actions cache (`type=gha`) for layer caching
- **Release builds**: No cache sharing with PR builds (semantic-release uses standard `docker build`)
- **Workaround**: Release builds are optimized via multi-stage Dockerfile caching

### Concurrency

- PRs cancel previous runs on the same branch
- Main branch runs are never cancelled
- Release job has exclusive access via `[skip ci]` in release commits

### Required Secrets

| Secret                    | Purpose                               | Where to Set         |
| ------------------------- | ------------------------------------- | -------------------- |
| `GITHUB_TOKEN`            | Automatic, provided by GitHub Actions | Built-in             |
| `NPM_TOKEN`               | Publishing to npm registry            | Repository secrets   |
| `CLAUDE_CODE_OAUTH_TOKEN` | Claude Code automated PR review       | Organization secrets |

### Branch Protection

Recommended settings for `main`:

- Require status checks: `Lint & Format`, `Type Check`, `Unit Tests`, all E2E jobs, all Security jobs
- Require branches to be up to date
- Require linear history (optional, for cleaner git log)

## Troubleshooting

### Release Not Triggered

1. Check commit messages follow conventional format
2. Ensure push is to `main` branch
3. Verify commit doesn't contain `[skip ci]`
4. Check if commit type triggers a release (see table above)

### Docker Build Fails

1. Check `.dockerignore` isn't excluding required files
2. Verify `pnpm-lock.yaml` is committed
3. Check Node.js version matches `package.json` engines

### npm Publish Fails

1. Verify `NPM_TOKEN` secret is set and valid
2. Check package name isn't taken on npm
3. Ensure version in `package.json` wasn't manually bumped

## Local Testing

### Test Docker Build

```bash
docker build -t shep-cli .
docker run shep-cli --version
```

### Test Release (Dry Run)

```bash
npx semantic-release --dry-run
```

### Validate Commit Messages

```bash
echo "feat(cli): add new command" | npx commitlint
```

---

## Maintaining This Document

**Update when:**

- CI/CD workflow changes
- New jobs are added
- Docker configuration changes
- Release process modifications

**Related files:**

- [.github/workflows/ci.yml](../../.github/workflows/ci.yml)
- [.github/workflows/pr-check.yml](../../.github/workflows/pr-check.yml)
- [.github/workflows/claude-review.yml](../../.github/workflows/claude-review.yml)
- [release.config.mjs](../../release.config.mjs)
- [Dockerfile](../../Dockerfile)
