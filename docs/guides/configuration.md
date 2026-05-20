# Configuration

Comprehensive guide to configuring Shep AI CLI.

## Configuration Files

### Global Configuration

Stored in `~/.shep/data` (SQLite database, singleton record). Settings include models, user profile, environment, and system configuration. Access via `getSettings()` singleton service or `shep settings show`.

Default web UI port is **4050**.

### Per-Repository Configuration

Located at `.shep/config.json` in the repository root:

```json
{
  "analysis": {
    "additionalExcludes": ["**/generated/**"],
    "reanalyzeOnChange": true
  },
  "agents": {
    "implementation": {
      "requireApproval": true
    }
  }
}
```

Repository settings override global settings.

## Authentication

### Authentication Methods

Agent authentication is configured through the interactive settings wizard:

```bash
# Launch the interactive settings wizard
shep settings

# Or configure the agent directly
shep settings agent
```

The selected agent type and its authentication are persisted in `~/.shep/data` (SQLite).

#### Session-Based

For Claude Code, Shep can detect and use an existing authenticated session automatically.

#### Token-Based

For providers that require API keys, the settings wizard prompts for the token during agent configuration.

## Server Settings

### Port Configuration

Default port is 4050. The port can be overridden via the `SHEP_PORT` environment variable:

```bash
SHEP_PORT=8080 shep
```

## Analysis Settings

### Exclude Patterns

Files matching these patterns are skipped during analysis:

```json
{
  "analysis": {
    "excludePatterns": [
      "**/node_modules/**",
      "**/dist/**",
      "**/build/**",
      "**/.git/**",
      "**/coverage/**",
      "**/*.min.js"
    ]
  }
}
```

Add repository-specific exclusions:

```json
{
  "analysis": {
    "additionalExcludes": ["**/vendor/**", "**/generated/**"]
  }
}
```

### File Limits

Prevent analysis of large files:

```json
{
  "analysis": {
    "maxFileSize": 1048576, // 1MB
    "maxFiles": 10000
  }
}
```

### Analysis Perspectives

Control which analyses run:

```json
{
  "analysis": {
    "perspectives": [
      "architecture",
      "dependencies",
      "patterns",
      "conventions",
      "tech-stack",
      "documentation"
    ]
  }
}
```

Remove a perspective to skip it.

## Agent Settings

### Agent Selection (Settings-Driven)

The configured agent type determines which AI coding tool Shep uses for ALL operations (feature creation, implementation, analysis). Configure via:

```bash
# Interactive wizard
shep settings agent

# Direct flags
shep settings agent --agent cursor
shep settings agent --agent claude-code
```

**Available agents:**

| Agent       | Binary   | Status      |
| ----------- | -------- | ----------- |
| Claude Code | `claude` | Available   |
| Cursor      | `cursor-agent` | Available   |
| Codex CLI   | `codex`  | Available   |
| Copilot CLI | `copilot` | Available  |
| Gemini CLI  | `gemini` | Available   |
| Aider       | —        | Tracked in [shep-ai/shep#618](https://github.com/shep-ai/shep/issues/618) |
| Continue    | —        | Tracked in [shep-ai/shep#618](https://github.com/shep-ai/shep/issues/618) |

The selected agent type is persisted in `~/.shep/data` (SQLite) and used by all subsequent commands. When you run `shep feat new`, the configured agent is resolved via `AgentExecutorFactory` — no command or component guesses or defaults the agent type.

### Concurrency

Control parallel agent execution:

```json
{
  "agents": {
    "maxConcurrentAgents": 4
  }
}
```

Lower this on resource-constrained systems.

### Timeouts

Prevent runaway agent execution:

```json
{
  "agents": {
    "timeoutMs": 300000, // 5 minutes
    "retryAttempts": 3
  }
}
```

### Implementation Agent

Control implementation behavior:

```json
{
  "agents": {
    "implementation": {
      "requireApproval": true, // Pause before each task
      "maxParallelTasks": 2, // Limit parallel task execution
      "autoCommit": false // Don't auto-commit changes
    }
  }
}
```

## UI Settings

### Theme

Set UI theme:

```json
{
  "ui": {
    "theme": "system" // "light", "dark", or "system"
  }
}
```

### Progress Display

Control progress verbosity:

```json
{
  "ui": {
    "showDetailedProgress": true,
    "showAgentLogs": false
  }
}
```

## Settings Commands

Settings are managed via the `shep settings` command group:

```bash
# Launch interactive settings wizard
shep settings

# Display current settings
shep settings show

# Initialize settings
shep settings init

# Configure agent type and auth
shep settings agent

# Configure IDE preference
shep settings ide

# Configure workflow settings
shep settings workflow

# Configure AI model preferences
shep settings model
```

## Environment Variables

Override configuration with environment variables:

| Variable            | Config Path     | Description                                         |
| ------------------- | --------------- | --------------------------------------------------- |
| `SHEP_PORT`         | `server.port`   | Server port                                         |
| `SHEP_HOST`         | `server.host`   | Server host                                         |
| `SHEP_API_KEY`      | `auth.token`    | Claude API key                                      |
| `SHEP_LOG_LEVEL`    | `logging.level` | Log verbosity                                       |
| `DEBUG`             | —               | Enable server-side debug logging (deployment, etc.) |
| `NEXT_PUBLIC_DEBUG` | —               | Enable web UI client-side debug logging             |

Example:

```bash
SHEP_PORT=8080 shep
```

Environment variables take precedence over config files.

## Configuration Precedence

Configuration is resolved in this order (highest to lowest):

1. Command line arguments
2. Environment variables
3. Repository `.shep/config.json`
4. Global `~/.shep/data` (SQLite settings)
5. Built-in defaults

## Example Configurations

### Minimal Setup

```json
{
  "auth": {
    "method": "token"
  }
}
```

### Team Development

```json
{
  "server": {
    "port": 4050
  },
  "agents": {
    "implementation": {
      "requireApproval": true,
      "autoCommit": false
    }
  }
}
```

### Large Repository

```json
{
  "analysis": {
    "excludePatterns": ["**/node_modules/**", "**/dist/**", "**/vendor/**", "**/*.generated.*"],
    "maxFileSize": 524288,
    "maxFiles": 5000,
    "perspectives": ["architecture", "dependencies", "tech-stack"]
  },
  "agents": {
    "maxConcurrentAgents": 2
  }
}
```

---

## Maintaining This Document

**Update when:**

- New configuration options are added
- Default values change
- Configuration precedence changes
- New environment variables are added

**Related docs:**

- [getting-started.md](./getting-started.md) - Initial setup
- [cli-commands.md](./cli-commands.md) - Config commands
