# Development Setup

Complete guide to setting up a development environment for Shep AI CLI.

## Prerequisites

### Required

| Tool    | Version | Purpose            |
| ------- | ------- | ------------------ |
| Node.js | 22+     | Runtime            |
| pnpm    | 8+      | Package management |
| Git     | 2.30+   | Version control    |

Install pnpm: `npm install -g pnpm`

### Recommended

| Tool                         | Purpose                     |
| ---------------------------- | --------------------------- |
| VS Code                      | IDE with TypeScript support |
| SQLite Browser               | Database inspection         |
| Playwright VS Code Extension | E2E test debugging          |
| HTTPie/curl                  | API testing                 |

## Initial Setup

### 1. Clone the Repository

```bash
git clone https://github.com/shep-ai/shep.git
cd shep
```

### 2. Install Dependencies

```bash
pnpm install
```

This installs all dependencies including dev dependencies.

If you previously built or exported Shep through Docker in the same checkout, do **not**
reuse the copied runtime bundle or Linux-built `node_modules` for local development.
Reset the workspace first:

```bash
pnpm reset:dev
```

That removes `node_modules`, `dist`, `web`, and Next.js build output, then reinstalls a
clean host-native dependency tree.

### 3. Verify Setup

```bash
# Run type check
pnpm typecheck

# Run tests
pnpm test

# Build
pnpm build

# Start Storybook (design system)
pnpm dev:storybook
```

## Project Structure

```
shep/
├── packages/core/src/
│   ├── domain/           # Business logic (no deps)
│   │   ├── entities/
│   │   ├── value-objects/
│   │   └── services/
│   ├── application/      # Use cases and ports
│   │   ├── use-cases/
│   │   ├── ports/
│   │   └── services/
│   └── infrastructure/   # External implementations
│       ├── repositories/
│       ├── agents/
│       ├── persistence/
│       └── services/
├── src/
│   └── presentation/     # UI layers
│       ├── cli/          # Commander-based CLI
│       ├── tui/          # @inquirer/prompts interactive wizards
│       └── web/          # Next.js + shadcn/ui
│           ├── app/      # Next.js App Router
│           ├── components/
│           │   ├── ui/   # shadcn/ui components
│           │   └── ...   # Feature components
│           └── stories/  # Storybook stories
├── tests/
│   ├── unit/             # Vitest unit tests
│   ├── integration/      # Vitest integration tests
│   └── e2e/              # Playwright e2e tests
├── docs/                 # Documentation
├── scripts/              # Build/dev scripts
├── .storybook/           # Storybook config
└── dist/                 # Build output
```

## IDE Configuration

### VS Code

Recommended extensions:

```json
{
  "recommendations": [
    "dbaeumer.vscode-eslint",
    "esbenp.prettier-vscode",
    "ms-vscode.vscode-typescript-next"
  ]
}
```

Settings (`.vscode/settings.json`):

```json
{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true
  },
  "typescript.preferences.importModuleSpecifier": "relative"
}
```

Debug configuration (`.vscode/launch.json`):

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Debug CLI",
      "type": "node",
      "request": "launch",
      "program": "${workspaceFolder}/src/presentation/cli/index.ts",
      "runtimeArgs": ["-r", "ts-node/register"],
      "console": "integratedTerminal"
    },
    {
      "name": "Debug Tests",
      "type": "node",
      "request": "launch",
      "program": "${workspaceFolder}/node_modules/.bin/vitest",
      "args": ["run", "--reporter=verbose"],
      "console": "integratedTerminal"
    }
  ]
}
```

## Development Commands

### Starting Development

```bash
# Run CLI directly (tsx)
pnpm dev:cli

# Start Web UI (same as `pnpm dev`)
pnpm dev:web

# Shortcut for local web development
pnpm dev

# Start Storybook (Design System)
pnpm dev:storybook
```

### Testing Locally

```bash
# Link package globally
pnpm link --global

# Now 'shep' command is available
shep --help

# Unlink when done
pnpm unlink --global @shepai/cli
```

### Database Development

Development database location: `~/.shep/repos/...`

Database migrations run automatically via the `user_version` pragma when the CLI bootstraps. To inspect the database manually:

```bash
# Using sqlite3 CLI
sqlite3 ~/.shep/repos/<encoded-path>/data

# Common queries
.tables
SELECT * FROM features;
```

## Working with Tests (TDD)

This project uses Test-Driven Development. See [tdd-guide.md](./tdd-guide.md) for the full TDD workflow.

### Running Tests

```bash
# TDD watch mode (recommended for development)
pnpm test:watch

# All tests
pnpm test

# Unit tests only
pnpm test:unit

# Integration tests only
pnpm test:int

# E2E tests (Playwright)
pnpm test:e2e

# Specific file
pnpm test:single tests/unit/domain/entities/feature.test.ts
```

### Test Database

Tests use in-memory SQLite:

```typescript
// tests/helpers/db.ts
export function createTestDatabase(): Database {
  return new Database(':memory:');
}
```

## Debugging

### Enable Debug Logging

```bash
# Via environment variable
DEBUG=shep:* pnpm dev:cli

# Or specific modules
DEBUG=shep:agents:* pnpm dev:cli

# Enable deployment service logging (dev server start/stop, port detection)
DEBUG=1 pnpm dev:cli
```

For web UI client-side debug logging, add to `src/presentation/web/.env.local`:

```bash
NEXT_PUBLIC_DEBUG=1
```

### Debug Agent Execution

```typescript
// Add to agent config
{
  "agents": {
    "logging": {
      "level": "debug",
      "includeMessages": true,
      "includePayloads": true
    }
  }
}
```

### Inspect SQLite Database

```bash
# Using sqlite3 CLI
sqlite3 ~/.shep/repos/<encoded-path>/data

# Common queries
.tables
SELECT * FROM features;
SELECT * FROM tasks WHERE feature_id = 'xxx';
```

## Common Issues

### Node Version Mismatch

```bash
# Check version
node --version

# Use nvm to switch
nvm use 22
```

### Build Errors After Pull

```bash
# Clean install
rm -rf node_modules
pnpm install

# Rebuild
pnpm build
```

### Tests Failing on CI But Not Locally

Check for:

- Environment variable differences
- File system timing issues
- Hardcoded paths

### SQLite Issues

```bash
# Rebuild native modules
pnpm rebuild better-sqlite3
```

### Playwright Issues

```bash
# Install browsers
pnpm exec playwright install

# Run with debug
pnpm test:e2e --debug
```

---

## Maintaining This Document

**Update when:**

- Prerequisites change
- Project structure changes
- New tooling is adopted
- Common issues are discovered

**Related docs:**

- [testing.md](./testing.md) - Testing details
- [building.md](./building.md) - Build process
- [CONTRIBUTING.md](../../CONTRIBUTING.md) - Contribution flow
