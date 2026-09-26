# User Guides

Guides for using Shep AI CLI effectively.

## Contents

| Guide                                                                | Description                             |
| -------------------------------------------------------------------- | --------------------------------------- |
| [getting-started.md](./getting-started.md)                           | Installation and first run              |
| [new-project-sdd.md](./new-project-sdd.md)                           | Start a new project with SDD, any stack |
| [configuration.md](./configuration.md)                               | Settings, agents, and env vars          |
| [cli-commands.md](./cli-commands.md)                                 | Complete CLI command reference          |
| [web-ui.md](./web-ui.md)                                             | Web interface usage                     |
| [langgraph-agents.md](./langgraph-agents.md)                         | LangGraph agent system guide            |
| [custom-worktree-provisioning.md](./custom-worktree-provisioning.md) | Custom worktree create / setup commands |

## Quick Start

```bash
# Install globally
npm install -g @shepai/cli

# Navigate to your project
cd ~/projects/my-app

# Run Shep
shep
```

This starts the Shep daemon and opens `http://localhost:4050/`. First-run setup — picking an
agent and a model — happens there, in the browser.

## Guide Categories

### Getting Started

New to Shep? Start with [getting-started.md](./getting-started.md) for installation and your first feature.

Starting a brand-new project? [new-project-sdd.md](./new-project-sdd.md) explains Features vs the App Builder and walks through a spec-driven start in an empty folder.

### Configuration

Need to customize Shep? See [configuration.md](./configuration.md) for auth setup and settings.

### Reference

Looking for specific commands? Check [cli-commands.md](./cli-commands.md) for the complete CLI reference.

### Web Interface

Prefer the browser? Read [web-ui.md](./web-ui.md) for web UI features.

### Agent System

Working with LangGraph agents? See [langgraph-agents.md](./langgraph-agents.md) for concepts and patterns.

### Worktrees

Monorepo or a repo that needs setup per worktree? See [custom-worktree-provisioning.md](./custom-worktree-provisioning.md).

---

## Maintaining This Directory

**Update when:**

- New guides are added
- Guide focus areas change
- Quick start process changes

**File naming:**

- Use kebab-case
- Be descriptive (`getting-started.md` not `gs.md`)
- Match topic names
