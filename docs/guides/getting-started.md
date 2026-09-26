# Getting Started

This guide walks you through installing Shep AI CLI and creating your first feature.

## Prerequisites

- **Node.js** 22 or higher (the repo pins `22` in `.nvmrc`, and `package.json` declares `engines.node >= 22.0.0`)
- **pnpm** 10 or higher (`npm install -g pnpm`)
- A repository to work with
- Access to at least one supported AI agent provider

## Installation

Install Shep globally via pnpm:

```bash
pnpm add -g @shepai/cli
```

Or with npm:

```bash
npm install -g @shepai/cli
```

Verify installation:

```bash
shep --version
```

## First Run

Navigate to your project directory and start Shep:

```bash
cd my-awesome-repository
shep
```

Bare `shep` is the same as `shep start`: it starts the Shep daemon in the background, prints the
control-center URL, and opens it in your browser.

```
✓ Shep started

  Open in your browser:
  http://localhost:4050/

```

If a daemon is already running, `shep` just prints the existing URL. Port 4050 is the default; if
it is taken, Shep picks the next free port. Use `shep start --port 8080` to choose one yourself.

To run the web UI in the foreground instead of as a background daemon — useful when you want to
watch its output — use `shep ui` (`--port <n>`, `--no-open`). `shep stop`, `shep restart` and
`shep status` manage the background daemon.

### Initial Setup Happens in the Browser

There is no terminal setup wizard on the default `shep` path — onboarding lives in the web UI.
The first time you open the control center, it walks you through two steps.

#### Step 1: Select Your Agent

The control center lists every supported agent, grouped with the models each one offers:

| Agent       | Type | Binary         | Notes                                   |
| ----------- | ---- | -------------- | --------------------------------------- |
| Claude Code | CLI  | `claude`       | Default                                 |
| Kimi Code   | CLI  | `kimi`         |                                         |
| Codex CLI   | CLI  | `codex`        |                                         |
| Copilot CLI | CLI  | `copilot`      |                                         |
| Cursor CLI  | CLI  | `cursor-agent` | Not the `cursor` desktop editor         |
| Gemini CLI  | CLI  | `gemini`       |                                         |
| Cline       | CLI  | `cline`        |                                         |
| OpenRouter  | SDK  | —              | Needs an API token                      |
| Together AI | SDK  | —              | Needs an API token                      |
| Ollama      | SDK  | —              | Local models, no key                    |
| LLM Proxy   | SDK  | —              | Local OpenAI-compatible proxy           |
| Demo        | Mock | —              | Scripted responses, for trying Shep out |

#### Step 2: Select a Model

After picking an agent, choose its default model. Only models that agent supports are offered.
Both choices are written to the settings database at `~/.shep/data`.

The control center then checks that the agent's binary is installed and authenticated, and shows
the install / login command if it is not.

### Configuring From the Terminal Instead

Everything the browser wizard does is also available as a command:

```bash
# Full interactive wizard (agent + IDE + workflow)
shep settings

# Or set the agent directly — --auth is required whenever --agent is given
shep settings agent --agent claude-code --auth session
shep settings agent --agent openrouter --auth token --token sk-xxx

# Pick the default model
shep settings model

# Check what is configured
shep settings show
```

> **Note:** `shep feat new` has its own short terminal onboarding gate when it detects an
> interactive TTY and nothing is configured yet. That is separate from the browser flow above.

### Adding a Repository

The control center asks you to point it at a repository — pick a folder in the browser, or add
one from the terminal:

```bash
# Register folders that already exist on disk — the argument is the PARENT
# directory whose subfolders become import candidates
shep repo import ~/projects
shep repo import ~/projects --all --git-only

# Or clone one from GitHub (interactive picker when --url is omitted)
shep repo add --url https://github.com/me/my-awesome-repository

shep repo ls
```

### Optional: Analyze the Repository

Shep does not analyze a repository on its own. When you want a standalone structure,
dependency, and architecture pass, run the `analyze-repository` agent:

```bash
shep run analyze-repository
shep run analyze-repository --prompt "Focus on security"
shep run analyze-repository --stream
```

Analysis also happens implicitly as the first phase of every feature, so this step is optional.

## Creating Your First Feature

### 1. Open the Web UI

Navigate to `http://localhost:4050/` in your browser.

### 2. Start a New Feature

The AI greets you with contextual options based on your repository:

```
┌──────────────────────────────────────────────┐
│          Welcome to my-app                   │
├──────────────────────────────────────────────┤
│                                              │
│  I've analyzed your React application with   │
│  Express backend. What would you like to     │
│  work on?                                    │
│                                              │
│  Suggested features based on your codebase:  │
│                                              │
│  □ Add user authentication                   │
│  □ Implement API rate limiting               │
│  □ Add unit tests for API endpoints          │
│  □ Other (describe your feature)             │
│                                              │
└──────────────────────────────────────────────┘
```

> **Note:** User selects a suggested feature or describes a custom one.

### 3. Gather Requirements

Select an option or describe your feature. The AI guides you through requirements:

```
┌──────────────────────────────────────────────────────┐
│   Requirements Gathering Conversation                │
├──────────────────────────────────────────────────────┤
│                                                      │
│  👤 User:                                            │
│     Add user authentication                          │
│                                                      │
│  🤖 Shep:                                            │
│     Great! Let's define the authentication           │
│     requirements. Which authentication method        │
│     would you like?                                  │
│                                                      │
│     □ Email/password                                 │
│     □ OAuth (Google, GitHub)                         │
│     □ Magic links                                    │
│     □ All of the above                               │
│                                                      │
│  👤 User:                                            │
│     OAuth (Google, GitHub)                           │
│                                                      │
│  🤖 Shep:                                            │
│     Got it. For OAuth, I'll need to know:            │
│     Should users be able to link multiple OAuth      │
│     providers?                                       │
│                                                      │
│     □ Yes, allow linking multiple accounts           │
│     □ No, one provider per user                      │
│                                                      │
│  ...continued...                                     │
│                                                      │
└──────────────────────────────────────────────────────┘
```

> **Note:** Conversational flow where Shep asks clarifying questions based on user selections.

### 4. Review the Plan

Once requirements are complete, Shep generates a plan:

```
┌───────────────────────────────────────────────────┐
│ Feature: User Authentication | Lifecycle: Plan    │
├───────────────────────────────────────────────────┤
│                                                   │
│ ┌─ TASKS (5) ─────────────────────────────────┐  │
│ │                                              │  │
│ │  □ Set up OAuth provider configuration       │  │
│ │  □ Create user model and migrations          │  │
│ │  □ Implement OAuth callback handlers         │  │
│ │  □ Add authentication middleware             │  │
│ │  □ Create login/logout UI components         │  │
│ │                                              │  │
│ └──────────────────────────────────────────────┘  │
│                                                   │
│ ┌─ DOCUMENTATION (3) ──────────────────────────┐  │
│ │                                              │  │
│ │  📄 Product Requirements Document            │  │
│ │  📄 Technical RFC                            │  │
│ │  📄 Implementation Tech Plan                 │  │
│ │                                              │  │
│ └──────────────────────────────────────────────┘  │
│                                                   │
│ ┌─ Actions ────────────────────────────────────┐  │
│ │  [Implement]    [Edit Plan]                  │  │
│ └──────────────────────────────────────────────┘  │
│                                                   │
└───────────────────────────────────────────────────┘
```

> **Note:** User can click [Implement] to start autonomous code generation or [Edit Plan] to modify tasks.

### 5. Start Implementation

Click "Implement" to begin autonomous code generation:

```
Implementing: User Authentication | Progress: 2/5 tasks complete

✓ Set up OAuth provider configuration
✓ Create user model and migrations
● Implement OAuth callback handlers
  └─ Creating src/routes/auth.ts
○ Add authentication middleware
○ Create login/logout UI components
```

> **Note:** ✓ = completed tasks, ● = in progress (with current file being modified), ○ = pending tasks.

### Doing the Same From the Terminal

The whole flow also works without the browser:

```bash
# Create a feature (the description is a required argument)
shep feat new "Add user authentication with OAuth"

# Watch it
shep feat ls
shep feat show <id>
shep feat logs <id>

# Answer an approval gate
shep feat approve <id>
shep feat reject <id> --reason "Use magic links instead of OAuth"

# Open the feature's worktree in your editor
shep ide <id>
```

`--reason` is required on `shep feat reject`. To skip the gates entirely for one feature, pass
`--allow-prd`, `--allow-plan`, `--allow-merge`, or `--allow-all` to `shep feat new`.

## Next Steps

- Starting from nothing? [Start an app, then add features](./start-an-app.md) — any stack, chosen during research
- Learn about [configuration options](./configuration.md)
- Explore the [CLI commands](./cli-commands.md)
- Master the [web UI](./web-ui.md)

## Troubleshooting

### Analysis Takes Too Long

Large repositories take longer. There is no exclude-list config file — analysis is driven by the
agent, so narrow it with a prompt instead:

```bash
shep run analyze-repository --prompt "Skip vendor/ and generated code; focus on src/"
```

If the daemon itself looks stuck, restart it:

```bash
shep restart
shep status
```

### Authentication Failed

If authentication fails:

1. Check your API key is valid for your selected provider
2. Ensure you have access to your chosen agent provider
3. Reconfigure the agent:
   ```bash
   shep settings agent
   ```

### Port Already in Use

If port 4050 is busy:

```bash
shep start --port 4051   # background daemon
shep ui --port 4051      # foreground
```

Shep also falls back to the next free port on its own, so this is only needed when you want a
specific one.

---

## Maintaining This Document

**Update when:**

- Installation process changes
- Setup wizard flow changes
- New features affect getting started
- Troubleshooting items are discovered

**Related docs:**

- [configuration.md](./configuration.md) - Settings, agents, and environment variables
- [cli-commands.md](./cli-commands.md) - CLI reference
